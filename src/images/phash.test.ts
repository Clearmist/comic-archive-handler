import { describe, it, expect } from 'vitest';
import { Transformer } from '@napi-rs/image';
import { computeImagePHash, phashToHex, hammingDistance } from './phash.js';
import { solidImage } from '../internal/testImages.js';

/** Concentric rings, so the hash reflects real structure rather than floating-point noise in a flat image's DCT. */
async function rings(): Promise<Buffer> {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = Math.round(128 + 120 * Math.cos(Math.hypot(x - 20, y - 26) / 6));
      pixels.set([value, 255 - value, value >> 1, 255], (y * size + x) * 4);
    }
  }

  return Transformer.fromRgbaPixels(pixels, size, size).png();
}

async function solidColor(r: number, g: number, b: number): Promise<Buffer> {
  return solidImage(64, 64, { r, g, b }).png();
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
    const original = await rings();
    const recompressed = await new Transformer(original).jpeg(70);

    const hashA = await computeImagePHash(original);
    const hashB = await computeImagePHash(recompressed);

    expect(hammingDistance(hashA, hashB)).toBeLessThanOrEqual(8);
  });

  it('gives a larger distance for a clearly different image', async () => {
    const imageA = await solidColor(255, 0, 0);
    const whiteHalf = await solidImage(32, 64, { r: 255, g: 255, b: 255 }).png();
    const imageB = await solidImage(64, 64, { r: 0, g: 0, b: 0 }).overlay(whiteHalf, 32, 0).png();

    const hashA = await computeImagePHash(imageA);
    const hashB = await computeImagePHash(imageB);

    expect(hammingDistance(hashA, hashB)).toBeGreaterThan(8);
  });
});
