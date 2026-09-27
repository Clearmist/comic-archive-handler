import { describe, it, expect } from 'vitest';
import { readImageDimensions, readImageInfo } from './dimensions.js';
import { solidImage } from '../internal/testImages.js';

describe('readImageDimensions', () => {
  it('reads the width and height of an image', async () => {
    const image = await solidImage(30, 50, { r: 1, g: 2, b: 3 }).png();

    expect(await readImageDimensions(image)).toEqual({ width: 30, height: 50 });
  });

  it('returns null for data that is not an image', async () => {
    expect(await readImageDimensions(Buffer.from('not an image'))).toBeNull();
  });
});

describe('readImageInfo', () => {
  it('reads the format along with the dimensions', async () => {
    const image = await solidImage(12, 8, { r: 1, g: 2, b: 3 }).webp();

    expect(await readImageInfo(image)).toEqual({ width: 12, height: 8, type: 'webp' });
  });

  it('reads BMP images', async () => {
    const bmp = await solidImage(4, 6, { r: 1, g: 2, b: 3 }).bmp();

    expect(await readImageInfo(bmp)).toEqual({ width: 4, height: 6, type: 'bmp' });
  });

  it('returns null for data that is not an image', async () => {
    expect(await readImageInfo(Buffer.from('not an image'))).toBeNull();
  });
});
