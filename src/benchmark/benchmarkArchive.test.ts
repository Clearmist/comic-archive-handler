import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { zipSync, strToU8 } from 'fflate';
import { benchmarkArchive } from './benchmarkArchive.js';
import { NoImagesFoundError } from '../errors.js';
import { listArchiveFiles } from '../listFiles.js';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeSampleComicPath(): Promise<string> {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 200, b: 30 } } })
    .png()
    .toBuffer();
  const zip = zipSync({
    'ComicInfo.xml': strToU8('<ComicInfo/>'),
    'P00001.png': new Uint8Array(png),
    'P00002.png': new Uint8Array(png),
  });
  const dir = await makeTempDir('cah-bench-source-');
  const filePath = path.join(dir, 'sample.cbz');
  await fs.writeFile(filePath, zip);
  return filePath;
}

describe('benchmarkArchive', () => {
  it('generates one archive per (writable container) x (image format) combination and a matching report', async () => {
    const sourcePath = await makeSampleComicPath();
    const reportsDir = await makeTempDir('cah-bench-reports-');

    const result = await benchmarkArchive(sourcePath, {
      reportsDir,
      creationIterations: 1,
      seekSamples: 2,
    });

    expect(result.variants).toHaveLength(12);

    const combos = new Set(result.variants.map((v) => `${v.archiveType}:${v.imageFormat}`));
    for (const archiveType of ['zip', 'tar', 'asar', '7z']) {
      for (const imageFormat of ['webp', 'png', 'jpg']) {
        expect(combos.has(`${archiveType}:${imageFormat}`)).toBe(true);
      }
    }

    for (const variant of result.variants) {
      const stat = await fs.stat(variant.filePath);
      expect(stat.size).toBe(variant.fileSizeBytes);
      expect(variant.pageCount).toBe(2);
      expect(variant.avgImageSizeBytes).toBeGreaterThan(0);
      expect(variant.avgCreationMs).toBeGreaterThanOrEqual(0);
      expect(variant.avgSeekMs).toBeGreaterThanOrEqual(0);

      const entries = await listArchiveFiles(variant.filePath);
      expect(entries).toContain('ComicInfo.xml');
      expect(entries.some((entryPath) => entryPath.endsWith(`.${imageExtFor(variant.imageFormat)}`))).toBe(true);
    }

    // The avgImageSizeBytes function depends only on image format, not container: it should
    // match across every container variant sharing the same image format.
    for (const imageFormat of ['webp', 'png', 'jpg']) {
      const sizes = result.variants.filter((v) => v.imageFormat === imageFormat).map((v) => v.avgImageSizeBytes);
      expect(new Set(sizes).size).toBe(1);
    }

    const reportContent = await fs.readFile(result.reportPath, 'utf8');
    expect(reportContent).toContain('# Archive Benchmark Report');
    expect(reportContent).toContain('### Read speed');
    expect(reportContent).toContain('### Storage size');
    expect(reportContent).toContain('### Transfer size');
    expect(reportContent).toContain('### Creation speed');
    expect(result.reportDir.startsWith(reportsDir)).toBe(true);

    // The source archive is extracted under the report directory, not a
    // throwaway temp dir, so it stays around alongside the report.
    expect(result.sourceDir.startsWith(result.reportDir)).toBe(true);
    expect(await fs.readFile(path.join(result.sourceDir, 'ComicInfo.xml'), 'utf8')).toBe('<ComicInfo/>');
    expect(await fs.stat(path.join(result.sourceDir, 'P00001.png'))).toBeTruthy();
  });

  it('only benchmarks the requested image formats', async () => {
    const sourcePath = await makeSampleComicPath();
    const reportsDir = await makeTempDir('cah-bench-reports-');

    const result = await benchmarkArchive(sourcePath, {
      reportsDir,
      creationIterations: 1,
      seekSamples: 1,
      imageFormats: ['webp'],
    });

    expect(result.variants).toHaveLength(4);
    expect(result.variants.every((v) => v.imageFormat === 'webp')).toBe(true);
  });

  it('rejects an empty imageFormats list', async () => {
    const sourcePath = await makeSampleComicPath();
    const reportsDir = await makeTempDir('cah-bench-reports-');

    await expect(benchmarkArchive(sourcePath, { reportsDir, imageFormats: [] })).rejects.toThrow(RangeError);
  });

  it('rejects an unsupported image format', async () => {
    const sourcePath = await makeSampleComicPath();
    const reportsDir = await makeTempDir('cah-bench-reports-');

    // @ts-expect-error deliberately invalid at the type level too
    await expect(benchmarkArchive(sourcePath, { reportsDir, imageFormats: ['gif'] })).rejects.toThrow(RangeError);
  });

  it('throws NoImagesFoundError when the archive has no image files', async () => {
    const zip = zipSync({ 'ComicInfo.xml': strToU8('<ComicInfo/>') });
    const dir = await makeTempDir('cah-bench-noimages-');
    const filePath = path.join(dir, 'no-images.cbz');
    await fs.writeFile(filePath, zip);
    const reportsDir = await makeTempDir('cah-bench-reports-');

    await expect(benchmarkArchive(filePath, { reportsDir, creationIterations: 1, seekSamples: 1 })).rejects.toThrow(NoImagesFoundError);
  });

  it('rejects a nonexistent file path', async () => {
    const reportsDir = await makeTempDir('cah-bench-reports-');
    await expect(benchmarkArchive('/no/such/file.cbz', { reportsDir })).rejects.toThrow();
  });
}, 60_000);

function imageExtFor(format: string): string {
  return format === 'jpg' ? 'jpg' : format;
}
