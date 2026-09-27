import { describe, it, expect } from 'vitest';
import { Transformer } from '@napi-rs/image';
import { findDecodedImageProblem, findImageStructureProblem, findJpegStructureProblem } from './integrity.js';
import { noiseImage, solidImage, type Rgb } from '../internal/testImages.js';

const EOI = Buffer.from([0xff, 0xd9]);

async function noiseJpeg(): Promise<Buffer> {
  return noiseImage(64, 128).jpeg(90);
}

/** A 64x128 JPEG of noise whose bottom `rows` rows are the flat color `fill`. */
async function noiseJpegWithFlatBottom(rows: number, { r, g, b }: Rgb): Promise<Buffer> {
  const pixels = new Uint8Array(await noiseImage(64, 128).rawPixels());

  for (let offset = (128 - rows) * 64 * 4; offset < pixels.length; offset += 4) {
    pixels.set([r, g, b, 255], offset);
  }

  return Transformer.fromRgbaPixels(pixels, 64, 128).jpeg(95);
}

/** The offset of the first segment with `marker`, pointing at its 0xff. */
function segmentOffset(jpeg: Buffer, marker: number): number {
  let offset = 2;

  while (jpeg[offset + 1] !== marker) {
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }

  return offset;
}

/** Cuts `jpeg` partway through its entropy-coded data, as an interrupted download or copy would. */
function truncate(jpeg: Buffer): Buffer {
  const scanStart = segmentOffset(jpeg, 0xda);

  return jpeg.subarray(0, scanStart + Math.floor((jpeg.length - scanStart) / 2));
}

describe('findJpegStructureProblem', () => {
  it('accepts a sound JPEG', async () => {
    expect(findJpegStructureProblem(await noiseJpeg())).toBeNull();
  });

  it('tolerates data after the end-of-image marker', async () => {
    expect(findJpegStructureProblem(Buffer.concat([await noiseJpeg(), Buffer.from('trailing')]))).toBeNull();
  });

  it('flags a JPEG that ends before its end-of-image marker', async () => {
    expect(findJpegStructureProblem(truncate(await noiseJpeg()))).toMatch(/^truncated/);
  });

  it('flags a JPEG cut off inside a header segment', async () => {
    const jpeg = await noiseJpeg();

    expect(findJpegStructureProblem(jpeg.subarray(0, segmentOffset(jpeg, 0xc4) + 10))).toMatch(/^truncated/);
  });

  it('flags a Huffman table with more codes than its code lengths allow', async () => {
    const jpeg = Buffer.from(await noiseJpeg());

    // Two 1-bit codes would use the all-ones code, which JPEG reserves.
    jpeg[segmentOffset(jpeg, 0xc4) + 5] = 2;

    expect(findJpegStructureProblem(jpeg)).toBe('invalid Huffman table: too many 1-bit codes');
  });

  it('ignores buffers that are not JPEGs', async () => {
    expect(findJpegStructureProblem(await noiseImage(8, 8).png())).toBeNull();
    expect(findImageStructureProblem(Buffer.from('not an image'))).toBeNull();
  });
});

describe('findDecodedImageProblem', () => {
  it('accepts a sound JPEG', async () => {
    expect(await findDecodedImageProblem(await noiseJpeg())).toBeNull();
  });

  it('flags the repeated block left where image data is missing, even when the end-of-image marker is present', async () => {
    const jpeg = Buffer.concat([truncate(await noiseJpeg()), EOI]);

    expect(findJpegStructureProblem(jpeg)).toBeNull();
    expect(await findDecodedImageProblem(jpeg)).toMatch(/^the bottom \d+ of 128 pixel rows repeat a single block/);
  });

  it('flags a flat grey band, the fill left behind in a file with restart markers', async () => {
    expect(await findDecodedImageProblem(await noiseJpegWithFlatBottom(48, { r: 128, g: 128, b: 128 }))).toMatch(
      /^the bottom 4\d of 128 pixel rows are flat grey/,
    );
  });

  it('accepts a flat band in any other color, such as a page margin', async () => {
    expect(await findDecodedImageProblem(await noiseJpegWithFlatBottom(48, { r: 255, g: 255, b: 255 }))).toBeNull();
    expect(await findDecodedImageProblem(await noiseJpegWithFlatBottom(48, { r: 200, g: 30, b: 30 }))).toBeNull();
  });

  it('accepts a page that is mid grey from top to bottom', async () => {
    expect(await findDecodedImageProblem(await solidImage(64, 128, { r: 128, g: 128, b: 128 }).jpeg(90))).toBeNull();
  });

  it('describes a JPEG that cannot be decoded', async () => {
    const jpeg = Buffer.from(await noiseJpeg());

    jpeg[segmentOffset(jpeg, 0xc4) + 5] = 2;

    expect(await findDecodedImageProblem(jpeg)).toMatch(/^could not be decoded: /);
  });

  it('skips formats other than JPEG', async () => {
    expect(await findDecodedImageProblem(await noiseImage(8, 8).png())).toBeNull();
  });
});
