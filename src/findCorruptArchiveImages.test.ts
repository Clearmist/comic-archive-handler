import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { findCorruptArchiveImages } from './findCorruptArchiveImages.js';
import { noiseImage } from './internal/testImages.js';

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
});
