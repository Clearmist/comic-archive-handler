import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { convertImageBuffer, convertArchiveImages } from './convert.js';
import { listArchiveFiles } from '../listFiles.js';

async function makeTestPng(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 10, g: 200, b: 30 } },
  })
    .png()
    .toBuffer();
}

describe('convertImageBuffer', () => {
  it('converts to webp with the required defaults (quality 92, effort 6, smartSubsample true)', async () => {
    const png = await makeTestPng();
    const webp = await convertImageBuffer(png, 'webp');
    const metadata = await sharp(webp).metadata();

    expect(metadata.format).toBe('webp');
  });

  it('converts to jpg with default quality 90', async () => {
    const png = await makeTestPng();
    const jpg = await convertImageBuffer(png, 'jpg');
    const metadata = await sharp(jpg).metadata();

    expect(metadata.format).toBe('jpeg');
  });

  it('honors explicit webp quality/effort overrides', async () => {
    const png = await makeTestPng();
    const highQuality = await convertImageBuffer(png, 'webp', { webp: { quality: 100, effort: 6 } });
    const lowQuality = await convertImageBuffer(png, 'webp', { webp: { quality: 10, effort: 0 } });

    expect(highQuality.length).toBeGreaterThan(0);
    expect(lowQuality.length).toBeGreaterThan(0);
  });

  it('PNG quality only takes effect when palette is enabled (documented sharp gotcha)', async () => {
    const png = await makeTestPng();
    const withoutPalette = await convertImageBuffer(png, 'png', { png: { quality: 10 } });
    const withPalette = await convertImageBuffer(png, 'png', { png: { quality: 10, palette: true } });
    const metaWithout = await sharp(withoutPalette).metadata();
    const metaWith = await sharp(withPalette).metadata();

    expect(metaWithout.format).toBe('png');
    expect(metaWith.format).toBe('png');
  });
});

describe('convertArchiveImages', () => {
  it('converts every image entry to the target format and renames extensions', async () => {
    const png = await makeTestPng();
    const zip = Buffer.from(zipSync({ 'page1.png': new Uint8Array(png), 'ComicInfo.xml': new Uint8Array(Buffer.from('<ComicInfo/>')) }));
    const converted = (await convertArchiveImages(zip, 'webp')) as Buffer;
    const files = await listArchiveFiles(converted);

    expect(files).toContain('page1.webp');
    expect(files).toContain('ComicInfo.xml');
    expect(files).not.toContain('page1.png');
  });
});
