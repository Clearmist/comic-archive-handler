import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { computeImagePHash, phashToHex, hammingDistance } from './phash.js';

async function solidColor(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

describe('computeImagePHash', () => {
  it('returns a 64-bit value with zero Hamming distance to itself', async () => {
    const image = await solidColor(200, 50, 50);
    const hash = await computeImagePHash(image);

    expect(typeof hash).toBe('bigint');
    expect(phashToHex(hash)).toMatch(/^[0-9a-f]{16}$/);
    expect(hammingDistance(hash, hash)).toBe(0);
  });

  it('gives a small distance for a near-duplicate (recompressed) image', async () => {
    const original = await solidColor(120, 180, 40);
    const recompressed = await sharp(original).jpeg({ quality: 70 }).toBuffer();

    const hashA = await computeImagePHash(original);
    const hashB = await computeImagePHash(recompressed);

    expect(hammingDistance(hashA, hashB)).toBeLessThanOrEqual(8);
  });

  it('gives a larger distance for a clearly different image', async () => {
    const imageA = await solidColor(255, 0, 0);
    const imageB = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 32, height: 64, channels: 3, background: { r: 255, g: 255, b: 255 } },
          })
            .png()
            .toBuffer(),
          left: 32,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    const hashA = await computeImagePHash(imageA);
    const hashB = await computeImagePHash(imageB);

    expect(hammingDistance(hashA, hashB)).toBeGreaterThan(8);
  });
});
