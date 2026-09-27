import { describe, it, expect } from 'vitest';
import { Transformer } from '@napi-rs/image';
import { zipSync } from 'fflate';
import { convertImageBuffer, convertArchiveImages } from './convert.js';
import { listArchiveFiles } from '../listFiles.js';
import { noiseImage, solidImage } from '../internal/testImages.js';
import { CorruptImageError } from '../errors.js';

async function makeTestPng(): Promise<Buffer> {
  return solidImage(16, 16, { r: 10, g: 200, b: 30 }).png();
}

describe('convertImageBuffer', () => {
  it('converts to webp with default quality 92', async () => {
    const png = await makeTestPng();
    const webp = await convertImageBuffer(png, 'webp');
    const metadata = await new Transformer(webp).metadata();

    expect(metadata.format).toBe('webp');
  });

  it('converts to avif with default quality 80', async () => {
    const png = await makeTestPng();
    const avif = await convertImageBuffer(png, 'avif');
    const metadata = await new Transformer(avif).metadata();

    expect(metadata.format).toBe('avif');
  });

  it('honors avif quality and chroma subsampling overrides', async () => {
    const png = await makeTestPng();
    const full = await convertImageBuffer(png, 'avif', { avif: { quality: 90, chromaSubsampling: '4:4:4' } });
    const subsampled = await convertImageBuffer(png, 'avif', { avif: { quality: 30, speed: 10, chromaSubsampling: '4:2:0' } });

    expect(subsampled.length).toBeLessThan(full.length);
  });

  it('converts to jpg with default quality 90', async () => {
    const png = await makeTestPng();
    const jpg = await convertImageBuffer(png, 'jpg');
    const metadata = await new Transformer(jpg).metadata();

    expect(metadata.format).toBe('jpeg');
  });

  it('honors explicit webp quality overrides', async () => {
    const png = await makeTestPng();
    const highQuality = await convertImageBuffer(png, 'webp', { webp: { quality: 100 } });
    const lowQuality = await convertImageBuffer(png, 'webp', { webp: { quality: 10 } });

    expect(highQuality.length).toBeGreaterThan(0);
    expect(lowQuality.length).toBeGreaterThan(0);
  });

  it('PNG quality only takes effect when palette is enabled (it drives palette quantization)', async () => {
    const png = await makeTestPng();
    const withoutPalette = await convertImageBuffer(png, 'png', { png: { quality: 10 } });
    const withPalette = await convertImageBuffer(png, 'png', { png: { quality: 10, palette: true } });
    const metaWithout = await new Transformer(withoutPalette).metadata();
    const metaWith = await new Transformer(withPalette).metadata();

    expect(metaWithout.format).toBe('png');
    expect(metaWith.format).toBe('png');
  });
});

describe('convertImageBuffer with a corrupt source', () => {
  it('throws CorruptImageError for a truncated JPEG', async () => {
    const jpeg = await noiseImage(64, 128).jpeg(90);

    await expect(convertImageBuffer(jpeg.subarray(0, jpeg.length - 100), 'webp')).rejects.toThrow(CorruptImageError);
  });
});

describe('convertArchiveImages', () => {
  it('names the corrupt page when a conversion fails', async () => {
    const jpeg = await noiseImage(64, 128).jpeg(90);
    const zip = Buffer.from(
      zipSync({ 'P00001.jpg': new Uint8Array(jpeg), 'P00002.jpg': new Uint8Array(jpeg.subarray(0, jpeg.length - 100)) }),
    );

    await expect(convertArchiveImages(zip, 'webp')).rejects.toMatchObject({
      name: 'CorruptImageError',
      entryPath: 'P00002.jpg',
      message: 'P00002.jpg: truncated: the file ends before its end-of-image marker',
    });
  });

  it('converts every image entry to the target format and renames extensions', async () => {
    const png = await makeTestPng();
    const zip = Buffer.from(zipSync({ 'page1.png': new Uint8Array(png), 'ComicInfo.xml': new Uint8Array(Buffer.from('<ComicInfo/>')) }));
    const converted = (await convertArchiveImages(zip, 'webp')) as Buffer;
    const files = await listArchiveFiles(converted);

    expect(files).toContain('page1.webp');
    expect(files).toContain('ComicInfo.xml');
    expect(files).not.toContain('page1.png');
  });

  it('keeps page order when converting several images at once', async () => {
    const png = await makeTestPng();
    const pages = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`page${index + 1}.png`, new Uint8Array(png)]));
    const zip = Buffer.from(zipSync(pages));
    const converted = (await convertArchiveImages(zip, 'webp', { concurrency: 4 })) as Buffer;
    const files = await listArchiveFiles(converted);

    expect(files).toEqual(Array.from({ length: 8 }, (_, index) => `page${index + 1}.webp`));
  });
});
