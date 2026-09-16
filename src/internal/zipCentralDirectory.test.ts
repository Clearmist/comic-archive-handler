import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseZipCentralDirectory, readZipEntryData } from './zipCentralDirectory.js';
import { ArchiveFormatError } from '../errors.js';

describe('parseZipCentralDirectory', () => {
  it('lists entries with correct sizes, in central-directory order', async () => {
    const zip = Buffer.from(
      zipSync({
        'a.txt': strToU8('hello'),
        'b.txt': strToU8('a longer piece of content for entry b'),
      }),
    );

    const entries = await parseZipCentralDirectory(zip);

    expect(entries.map((entry) => entry.path)).toEqual(['a.txt', 'b.txt']);
    expect(entries[0]!.uncompressedSize).toBe('hello'.length);
    expect(entries[1]!.uncompressedSize).toBe('a longer piece of content for entry b'.length);
  });

  it('omits directory entries', async () => {
    const zip = Buffer.from(zipSync({ 'dir/': new Uint8Array(0), 'dir/a.txt': strToU8('hello') }));

    const entries = await parseZipCentralDirectory(zip);

    expect(entries.map((entry) => entry.path)).toEqual(['dir/a.txt']);
  });

  it('reads an entry deep in the archive directly, without touching the ones before it', async () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 50; i++) {
      files[`page-${i}.txt`] = strToU8(`content for page ${i}`);
    }
    const zip = Buffer.from(zipSync(files));

    const entries = await parseZipCentralDirectory(zip);
    const target = entries.find((entry) => entry.path === 'page-49.txt')!;
    const buffer = await readZipEntryData(zip, target);

    expect(buffer.toString('utf8')).toBe('content for page 49');
  });

  it('decompresses deflated entries and passes through stored ones', async () => {
    const deflated = Buffer.from(zipSync({ 'a.txt': strToU8('deflated content') }, { level: 6 }));
    const stored = Buffer.from(zipSync({ 'a.txt': strToU8('stored content') }, { level: 0 }));

    const deflatedEntries = await parseZipCentralDirectory(deflated);
    const storedEntries = await parseZipCentralDirectory(stored);

    expect((await readZipEntryData(deflated, deflatedEntries[0]!)).toString('utf8')).toBe('deflated content');
    expect((await readZipEntryData(stored, storedEntries[0]!)).toString('utf8')).toBe('stored content');
  });

  it('throws when there is no end-of-central-directory record', async () => {
    const notAZip = Buffer.from('this is not a zip file');

    await expect(parseZipCentralDirectory(notAZip)).rejects.toThrow(ArchiveFormatError);
  });

  it('reads the real totals from a zip64 end-of-central-directory record when the regular one overflows', async () => {
    const zip = Buffer.from(zipSync({ 'a.txt': strToU8('hello'), 'b.txt': strToU8('world') }));

    // Locate the regular EOCD that zipSync produced, then rebuild the trailer
    // as zip64 (a zip64 EOCD record + locator + a regular EOCD whose totals
    // are all sentineled to 0xffff/0xffffffff) pointing at the same,
    // untouched central directory: this is the only way to exercise the
    // zip64 path without a multi-GB fixture.
    let eocdOffset = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    expect(eocdOffset).toBeGreaterThanOrEqual(0);

    const originalEocd = zip.subarray(eocdOffset);
    const totalEntries = originalEocd.readUInt16LE(10);
    const centralDirectorySize = originalEocd.readUInt32LE(12);
    const centralDirectoryOffset = originalEocd.readUInt32LE(16);

    const prefix = zip.subarray(0, eocdOffset);
    const zip64EocdOffset = prefix.length;

    const zip64Eocd = Buffer.alloc(56);
    zip64Eocd.writeUInt32LE(0x06064b50, 0);
    zip64Eocd.writeBigUInt64LE(44n, 4);
    zip64Eocd.writeUInt16LE(45, 12);
    zip64Eocd.writeUInt16LE(45, 14);
    zip64Eocd.writeUInt32LE(0, 16);
    zip64Eocd.writeUInt32LE(0, 20);
    zip64Eocd.writeBigUInt64LE(BigInt(totalEntries), 24);
    zip64Eocd.writeBigUInt64LE(BigInt(totalEntries), 32);
    zip64Eocd.writeBigUInt64LE(BigInt(centralDirectorySize), 40);
    zip64Eocd.writeBigUInt64LE(BigInt(centralDirectoryOffset), 48);

    const zip64Locator = Buffer.alloc(20);
    zip64Locator.writeUInt32LE(0x07064b50, 0);
    zip64Locator.writeUInt32LE(0, 4);
    zip64Locator.writeBigUInt64LE(BigInt(zip64EocdOffset), 8);
    zip64Locator.writeUInt32LE(1, 16);

    const newEocd = Buffer.alloc(22);
    newEocd.writeUInt32LE(0x06054b50, 0);
    newEocd.writeUInt16LE(0xffff, 8);
    newEocd.writeUInt16LE(0xffff, 10);
    newEocd.writeUInt32LE(0xffffffff, 12);
    newEocd.writeUInt32LE(0xffffffff, 16);
    newEocd.writeUInt16LE(0, 20);

    const zip64Archive = Buffer.concat([prefix, zip64Eocd, zip64Locator, newEocd]);

    const entries = await parseZipCentralDirectory(zip64Archive);

    expect(entries.map((entry) => entry.path)).toEqual(['a.txt', 'b.txt']);
    expect((await readZipEntryData(zip64Archive, entries[0]!)).toString('utf8')).toBe('hello');
  });
});
