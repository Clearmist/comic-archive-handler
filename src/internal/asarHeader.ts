import { ArchiveFormatError } from '../errors.js';

export interface AsarFileEntry {
  path: string;
  /** Byte offset relative to the start of the content region (i.e. after the header). */
  offset: number;
  size: number;
}

export interface AsarHeaderInfo {
  header: unknown;
  files: AsarFileEntry[];
  /** Absolute byte offset in the archive where file content begins. */
  contentOffset: number;
}

interface AsarHeaderNode {
  files?: Record<string, AsarHeaderNode>;
  size?: number;
  offset?: string;
  unpacked?: boolean;
}

/**
 * Parses an asar archive's header from a byte reader.
 *
 * On-disk layout (Chromium Pickle format, two levels of nesting):
 *   [8 bytes: outer pickle wrapping a uint32 `size`]
 *   [`size` bytes: header pickle == [4-byte LE payload length][payload]]
 *     payload == string pickle == [4-byte LE string byte-length][UTF-8 bytes (+padding, ignored here)]
 *   [content region: raw concatenated file bytes, starting at 8 + size]
 */
export async function parseAsarHeader(readRange: (start: number, end: number) => Promise<Buffer>): Promise<AsarHeaderInfo> {
  const prefix = await readRange(0, 8);
  if (prefix.length < 8) {
    throw new ArchiveFormatError('File is too small to be a valid asar archive.');
  }
  const outerPayloadLength = prefix.readUInt32LE(0);
  if (outerPayloadLength !== 4) {
    throw new ArchiveFormatError('Not a valid asar archive (unexpected pickle header).');
  }
  const size = prefix.readUInt32LE(4);
  const headerBuf = await readRange(8, 8 + size);
  if (headerBuf.length < 8) {
    throw new ArchiveFormatError('Not a valid asar archive (truncated header).');
  }
  const stringLength = headerBuf.readUInt32LE(4);
  if (8 + stringLength > headerBuf.length) {
    throw new ArchiveFormatError('Not a valid asar archive (truncated header string).');
  }
  const headerString = headerBuf.subarray(8, 8 + stringLength).toString('utf8');

  let header: AsarHeaderNode;
  try {
    header = JSON.parse(headerString) as AsarHeaderNode;
  } catch {
    throw new ArchiveFormatError('Not a valid asar archive (header is not valid JSON).');
  }
  if (!header || typeof header !== 'object' || !header.files) {
    throw new ArchiveFormatError('Not a valid asar archive (header has no files index).');
  }

  const contentOffset = 8 + size;
  const files: AsarFileEntry[] = [];
  collectFiles(header, '', files);

  return { header, files, contentOffset };
}

function collectFiles(node: AsarHeaderNode, prefix: string, out: AsarFileEntry[]): void {
  if (!node.files) {
    return;
  }
  for (const [name, child] of Object.entries(node.files)) {
    const entryPath = prefix ? `${prefix}/${name}` : name;
    if (child.files) {
      collectFiles(child, entryPath, out);
    } else if (typeof child.offset === 'string' && typeof child.size === 'number') {
      out.push({ path: entryPath, offset: Number(child.offset), size: child.size });
    }
  }
}

/** True if the header's file tree contains an entry at the archive root named `name`. */
export function hasRootFile(header: unknown, name: string): boolean {
  const root = header as AsarHeaderNode;
  return Boolean(root?.files?.[name] && !root.files[name]?.files);
}
