import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { readImageDimensions, readImageInfo } from './dimensions.js';

describe('readImageDimensions', () => {
  it('reads the width and height of an image', async () => {
    const image = await sharp({ create: { width: 30, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .png()
      .toBuffer();

    expect(await readImageDimensions(image)).toEqual({ width: 30, height: 50 });
  });

  it('returns null for data that is not an image', async () => {
    expect(await readImageDimensions(Buffer.from('not an image'))).toBeNull();
  });
});

describe('readImageInfo', () => {
  it('reads the format along with the dimensions', async () => {
    const image = await sharp({ create: { width: 12, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .webp()
      .toBuffer();

    expect(await readImageInfo(image)).toEqual({ width: 12, height: 8, type: 'webp' });
  });

  it('reads BMP headers, which sharp cannot', async () => {
    const bmp = Buffer.alloc(54);
    bmp.write('BM', 0, 'latin1');
    bmp.writeInt32LE(4, 18);
    bmp.writeInt32LE(-6, 22);

    expect(await readImageInfo(bmp)).toEqual({ width: 4, height: 6, type: 'bmp' });
  });

  it('returns null for data that is not an image', async () => {
    expect(await readImageInfo(Buffer.from('not an image'))).toBeNull();
  });
});
