import { inflateSync } from 'fflate';
import type { ArchiveInput } from '../types.js';
import { ArchiveFormatError } from '../errors.js';
import { inputSize, readInputRange } from './inputSource.js';

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;

const EOCD_FIXED_SIZE = 22;
const EOCD_MAX_COMMENT_SIZE = 0xffff;
const ZIP64_EOCD_LOCATOR_SIZE = 20;
const UINT32_MAX = 0xffffffff;
const UINT16_MAX = 0xffff;

export interface ZipCentralDirectoryEntry {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  /** Byte offset of this entry's local file header, needed to find its actual data, since the central directory only records metadata. */
  localHeaderOffset: number;
}

/**
 * The end-of-central-directory record sits at the end of the file, after an
 * optional variable-length comment, so it's found by scanning backward from
 * the end for its signature rather than reading forward from the start.
 */
async function findEndOfCentralDirectory(input: ArchiveInput): Promise<{ record: Buffer; offset: number }> {
  const size = await inputSize(input);
  const searchStart = Math.max(0, size - EOCD_FIXED_SIZE - EOCD_MAX_COMMENT_SIZE);
  const tail = await readInputRange(input, searchStart, size);

  for (let i = tail.length - EOCD_FIXED_SIZE; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
      return { record: tail.subarray(i), offset: searchStart + i };
    }
  }

  throw new ArchiveFormatError('Not a valid zip archive: no end-of-central-directory record found.');
}

interface CentralDirectoryLocation {
  totalEntries: number;
  centralDirectorySize: number;
  centralDirectoryOffset: number;
}

/**
 * Zip64 stores the real (64-bit) totals in its own record, pointed to by a
 * fixed-size locator that sits immediately before the regular
 * end-of-central-directory record.
 */
async function readZip64EndOfCentralDirectory(input: ArchiveInput, eocdOffset: number): Promise<CentralDirectoryLocation> {
  const locatorOffset = eocdOffset - ZIP64_EOCD_LOCATOR_SIZE;

  if (locatorOffset < 0) {
    throw new ArchiveFormatError('Not a valid zip64 archive: missing end-of-central-directory locator.');
  }

  const locator = await readInputRange(input, locatorOffset, locatorOffset + ZIP64_EOCD_LOCATOR_SIZE);

  if (locator.length < ZIP64_EOCD_LOCATOR_SIZE || locator.readUInt32LE(0) !== ZIP64_EOCD_LOCATOR_SIGNATURE) {
    throw new ArchiveFormatError('Not a valid zip64 archive: missing end-of-central-directory locator.');
  }

  const zip64EocdOffset = Number(locator.readBigUInt64LE(8));
  const record = await readInputRange(input, zip64EocdOffset, zip64EocdOffset + 56);

  if (record.length < 56 || record.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE) {
    throw new ArchiveFormatError('Not a valid zip64 archive: malformed end-of-central-directory record.');
  }

  return {
    totalEntries: Number(record.readBigUInt64LE(32)),
    centralDirectorySize: Number(record.readBigUInt64LE(40)),
    centralDirectoryOffset: Number(record.readBigUInt64LE(48)),
  };
}

/** Reads the zip64 extra field's 8-byte values for whichever fixed-header fields overflowed 32 bits, in the fixed order the spec requires: uncompressed size, compressed size, local header offset. */
function readZip64ExtraField(
  extra: Buffer,
  overflowed: { uncompressedSize: boolean; compressedSize: boolean; localHeaderOffset: boolean },
): { uncompressedSize?: number; compressedSize?: number; localHeaderOffset?: number } {
  let pos = 0;

  while (pos + 4 <= extra.length) {
    const fieldId = extra.readUInt16LE(pos);
    const fieldSize = extra.readUInt16LE(pos + 2);

    if (fieldId === ZIP64_EXTRA_FIELD_ID) {
      let valuePos = pos + 4;
      const result: { uncompressedSize?: number; compressedSize?: number; localHeaderOffset?: number } = {};

      if (overflowed.uncompressedSize && valuePos + 8 <= extra.length) {
        result.uncompressedSize = Number(extra.readBigUInt64LE(valuePos));
        valuePos += 8;
      }
      if (overflowed.compressedSize && valuePos + 8 <= extra.length) {
        result.compressedSize = Number(extra.readBigUInt64LE(valuePos));
        valuePos += 8;
      }
      if (overflowed.localHeaderOffset && valuePos + 8 <= extra.length) {
        result.localHeaderOffset = Number(extra.readBigUInt64LE(valuePos));
        valuePos += 8;
      }

      return result;
    }

    pos += 4 + fieldSize;
  }

  throw new ArchiveFormatError('Not a valid zip64 archive: an oversized entry is missing its zip64 extra field.');
}

/**
 * Parses a zip's central directory, the entry index at the end of the
 * file, into per-entry metadata (name, sizes, compression method, and the
 * offset of its local file header). Reading this index costs a couple of
 * small range reads regardless of archive size; it never reads or
 * decompresses entry data itself, which is why entries can then be read in
 * any order at O(1) cost each rather than needing a forward scan through
 * every entry that precedes the one wanted.
 */
export async function parseZipCentralDirectory(input: ArchiveInput): Promise<ZipCentralDirectoryEntry[]> {
  const { record: eocd, offset: eocdOffset } = await findEndOfCentralDirectory(input);

  let totalEntries = eocd.readUInt16LE(10);
  let centralDirectorySize = eocd.readUInt32LE(12);
  let centralDirectoryOffset = eocd.readUInt32LE(16);

  if (totalEntries === UINT16_MAX || centralDirectorySize === UINT32_MAX || centralDirectoryOffset === UINT32_MAX) {
    ({ totalEntries, centralDirectorySize, centralDirectoryOffset } = await readZip64EndOfCentralDirectory(input, eocdOffset));
  }

  const centralDirectory = await readInputRange(input, centralDirectoryOffset, centralDirectoryOffset + centralDirectorySize);
  const entries: ZipCentralDirectoryEntry[] = [];
  let pos = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > centralDirectory.length || centralDirectory.readUInt32LE(pos) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new ArchiveFormatError('Not a valid zip archive: malformed central directory entry.');
    }

    const compressionMethod = centralDirectory.readUInt16LE(pos + 10);
    let compressedSize = centralDirectory.readUInt32LE(pos + 20);
    let uncompressedSize = centralDirectory.readUInt32LE(pos + 24);
    const nameLength = centralDirectory.readUInt16LE(pos + 28);
    const extraLength = centralDirectory.readUInt16LE(pos + 30);
    const commentLength = centralDirectory.readUInt16LE(pos + 32);
    let localHeaderOffset = centralDirectory.readUInt32LE(pos + 42);

    const name = centralDirectory.toString('utf8', pos + 46, pos + 46 + nameLength);

    const overflowed = {
      uncompressedSize: uncompressedSize === UINT32_MAX,
      compressedSize: compressedSize === UINT32_MAX,
      localHeaderOffset: localHeaderOffset === UINT32_MAX,
    };

    if (overflowed.uncompressedSize || overflowed.compressedSize || overflowed.localHeaderOffset) {
      const extra = centralDirectory.subarray(pos + 46 + nameLength, pos + 46 + nameLength + extraLength);
      const zip64Values = readZip64ExtraField(extra, overflowed);

      uncompressedSize = zip64Values.uncompressedSize ?? uncompressedSize;
      compressedSize = zip64Values.compressedSize ?? compressedSize;
      localHeaderOffset = zip64Values.localHeaderOffset ?? localHeaderOffset;
    }

    if (!name.endsWith('/')) {
      entries.push({ path: name, compressedSize, uncompressedSize, compressionMethod, localHeaderOffset });
    }

    pos += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Reads and decompresses one entry's data, using its central directory
 * metadata to locate the bytes directly, with no scan through other entries.
 * The local file header still has to be read first because its name/extra
 * field lengths (which can differ from the central directory's) are what
 * determine where the entry's actual data starts.
 */
export async function readZipEntryData(input: ArchiveInput, entry: ZipCentralDirectoryEntry): Promise<Buffer> {
  const localHeader = await readInputRange(input, entry.localHeaderOffset, entry.localHeaderOffset + 30);

  if (localHeader.length < 30 || localHeader.readUInt32LE(0) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new ArchiveFormatError(`Not a valid zip archive: malformed local file header for "${entry.path}".`);
  }

  const nameLength = localHeader.readUInt16LE(26);
  const extraLength = localHeader.readUInt16LE(28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = await readInputRange(input, dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed;
  }

  if (entry.compressionMethod === 8) {
    return Buffer.from(inflateSync(compressed));
  }

  throw new ArchiveFormatError(`Unsupported zip compression method (${entry.compressionMethod}) for "${entry.path}".`);
}
