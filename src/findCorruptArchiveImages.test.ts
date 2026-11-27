import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { findCorruptArchiveImages } from './findCorruptArchiveImages.js';
import { noiseImage } from './internal/testImages.js';
import { readArchiveEntries } from './readArchiveEntries.js';

/** A zip whose `bad` entry is deflated and then overwritten with bytes that can't be inflated (block type 3). */
function zipWithUninflatableEntry(good: Record<string, Uint8Array>, bad: string): Buffer {
  const zip = Buffer.from(zipSync({ [bad]: [new Uint8Array(4096).fill(7), { level: 6 }], ...good }));
  // The bad entry is first, so its data follows the first local header.
  const dataStart = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
  zip.fill(0xff, dataStart, dataStart + 4);
  return zip;
}

describe('findCorruptArchiveImages', () => {
  it('returns each image entry with a structural problem, in archive order', async () => {
    const jpeg = await noiseImage(64, 128).jpeg(90);
    const zip = Buffer.from(
      zipSync({
        'P00001.jpg': new Uint8Array(jpeg),
        'P00002.jpg': new Uint8Array(jpeg.subarray(0, jpeg.length - 100)),
        'P00003.png': new Uint8Array(await noiseImage(8, 8).png()),
        'notes.jpg.txt': strToU8('not read'),
      }),
    );

    expect(await findCorruptArchiveImages(zip)).toEqual([
      { path: 'P00002.jpg', reason: 'truncated: the file ends before its end-of-image marker' },
    ]);
  });

  it('returns an empty array when every image is sound', async () => {
    const zip = Buffer.from(zipSync({ 'P00001.jpg': new Uint8Array(await noiseImage(16, 16).jpeg(90)) }));

    expect(await findCorruptArchiveImages(zip)).toEqual([]);
  });

  it('reports an entry that fails to decompress as unreadable, and still checks the entries after it', async () => {
    const jpeg = await noiseImage(16, 16).jpeg(90);
    const zip = zipWithUninflatableEntry(
      { 'P00002.jpg': new Uint8Array(jpeg), 'P00003.jpg': new Uint8Array(jpeg.subarray(0, jpeg.length - 50)) },
      'P00001.jpg',
    );

    const corrupt = await findCorruptArchiveImages(zip);

    expect(corrupt.map((image) => image.path)).toEqual(['P00001.jpg', 'P00003.jpg']);
    expect(corrupt[0]!.reason).toMatch(/^unreadable: /);
  });
});

describe('readArchiveEntries onEntryError', () => {
  it('skips and reports an unreadable entry when given, and throws without it', async () => {
    const zip = zipWithUninflatableEntry({ 'P00002.jpg': new Uint8Array([1, 2, 3]) }, 'P00001.jpg');
    const failed: string[] = [];
    const read: string[] = [];

    for await (const entry of readArchiveEntries(zip, { onEntryError: (entryPath) => failed.push(entryPath) })) {
      read.push(entry.path);
    }

    expect(failed).toEqual(['P00001.jpg']);
    expect(read).toEqual(['P00002.jpg']);
    await expect(async () => {
      for await (const _entry of readArchiveEntries(zip)) {
        // Draining the pass is enough to reach the bad entry.
      }
    }).rejects.toThrow();
  });
});
