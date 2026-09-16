import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { extractArchive } from '../extractArchive.js';
import { stripNonEssentialFiles } from '../strip.js';
import { convertArchive } from '../convertArchive.js';
import { convertArchiveImages } from '../images/convert.js';
import { listArchiveFiles } from '../listFiles.js';
import { sha256ArchiveEntry } from '../hashing/sha256.js';
import { isImagePath } from '../images/isImage.js';
import { resolveWritableTempDir, cleanupTempDir } from '../internal/tempDir.js';
import { NoImagesFoundError, FilesystemAccessError } from '../errors.js';
import { averageDuration, averageDurationOverItems } from './timing.js';
import { renderBenchmarkReportMarkdown } from './report.js';
import { WRITABLE_ARCHIVE_TYPES, BENCHMARK_IMAGE_FORMATS, ARCHIVE_TYPE_EXTENSIONS } from './types.js';
import type { BenchmarkArchiveOptions, BenchmarkArchiveResult, BenchmarkVariantResult } from './types.js';
import type { ImageOutputFormat } from '../types.js';

function timestampForDirName(date: Date): string {
  return date
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d+Z$/, 'Z');
}

function pickRandomSamples<T>(items: T[], count: number): T[] {
  if (items.length === 0) {
    return [];
  }

  const samples: T[] = [];

  for (let i = 0; i < count; i++) {
    samples.push(items[Math.floor(Math.random() * items.length)]!);
  }

  return samples;
}

/**
 * The average byte size of one converted image, independent of which
 * container it ends up packaged in ("transfer size": what a client
 * actually downloads to fetch a single page).
 */
async function averageConvertedImageSize(preConverted: Buffer, imageFormat: ImageOutputFormat, tempDir: string): Promise<number> {
  const extractDir = path.join(tempDir, `preconverted-${imageFormat}`);
  const entries = await extractArchive(preConverted, extractDir, { tempDir });
  const imagePaths = entries.filter((entryPath) => isImagePath(entryPath));

  let totalBytes = 0;

  for (const entryPath of imagePaths) {
    const { size } = await fs.stat(path.join(extractDir, entryPath));

    totalBytes += size;
  }

  return totalBytes / imagePaths.length;
}

/**
 * Extracts a comic archive, validates it contains image files, then
 * generates one archive per (writable container format) x (page image
 * format) combination, benchmarks each variant's creation speed and random
 * single-file read speed, and writes a markdown report summarizing the
 * results.
 *
 * Images are re-encoded to each target format once per image format, before
 * any timing starts; `avgCreationMs` measures only packaging already-encoded
 * entries into the target container, not the image re-encoding cost.
 *
 * Throws `ArchiveFormatError` (undetectable format) or
 * `UnsupportedOperationError` (ACE) if `filePath` is not extractable,
 * `NoImagesFoundError` if the archive contains no image files, and
 * `RangeError` if `options.imageFormats` is empty or names an unsupported
 * format.
 */
export async function benchmarkArchive(filePath: string, options: BenchmarkArchiveOptions = {}): Promise<BenchmarkArchiveResult> {
  try {
    await fs.access(filePath);
  } catch {
    throw new FilesystemAccessError(`No file exists at "${filePath}".`);
  }

  const creationIterations = Math.max(1, options.creationIterations ?? 3);
  const seekSamples = Math.max(1, options.seekSamples ?? 10);
  const imageFormats = options.imageFormats ?? BENCHMARK_IMAGE_FORMATS;

  if (imageFormats.length === 0) {
    throw new RangeError('options.imageFormats must include at least one image format.');
  }

  const unsupportedFormats = imageFormats.filter((format) => !BENCHMARK_IMAGE_FORMATS.includes(format));

  if (unsupportedFormats.length > 0) {
    throw new RangeError(
      `Unsupported image format(s): ${unsupportedFormats.join(', ')}. Supported formats: ${BENCHMARK_IMAGE_FORMATS.join(', ')}.`,
    );
  }

  const tempDir = await resolveWritableTempDir(options.tempDir);

  try {
    const generatedAt = new Date();
    const reportsRoot = options.reportsDir ?? path.join(process.cwd(), 'reports');
    const reportDir = path.join(reportsRoot, timestampForDirName(generatedAt));
    const sourceDir = path.join(reportDir, 'source');
    const archivesDir = path.join(reportDir, 'archives');

    await fs.mkdir(archivesDir, { recursive: true });

    // Extracted here (not a throwaway tempDir) so the actual source files
    // used for every conversion below are visible alongside the report.
    const extractedPaths = await extractArchive(filePath, sourceDir, { tempDir });

    if (!extractedPaths.some((entryPath) => isImagePath(entryPath))) {
      throw new NoImagesFoundError(`Archive "${filePath}" does not contain any image files.`);
    }

    // Read directly from `filePath` (the original archive), never from a
    // previously-converted variant, so every image format is re-encoded from
    // the same untouched source pages.
    const stripped = (await stripNonEssentialFiles(filePath, { tempDir })) as Buffer;

    const variants: BenchmarkVariantResult[] = [];

    for (const imageFormat of imageFormats) {
      const preConverted = (await convertArchiveImages(stripped, imageFormat, { ...options.image, tempDir })) as Buffer;
      const avgImageSizeBytes = await averageConvertedImageSize(preConverted, imageFormat, tempDir);

      for (const archiveType of WRITABLE_ARCHIVE_TYPES) {
        const fileName = `${archiveType}-${imageFormat}.${ARCHIVE_TYPE_EXTENSIONS[archiveType]}`;
        const outputPath = path.join(archivesDir, fileName);

        const avgCreationMs = await averageDuration(creationIterations, async () => {
          await convertArchive(preConverted, archiveType, { tempDir, output: outputPath });
        });

        const entries = await listArchiveFiles(outputPath);
        const imageEntries = entries.filter((entryPath) => isImagePath(entryPath));
        const samples = pickRandomSamples(imageEntries, seekSamples);
        const avgSeekMs = await averageDurationOverItems(samples, async (entryPath) => {
          await sha256ArchiveEntry(outputPath, entryPath);
        });

        const { size } = await fs.stat(outputPath);

        variants.push({
          archiveType,
          imageFormat,
          fileName,
          filePath: outputPath,
          fileSizeBytes: size,
          pageCount: imageEntries.length,
          avgImageSizeBytes,
          avgCreationMs,
          avgSeekMs,
        });
      }
    }

    const result: BenchmarkArchiveResult = {
      sourcePath: filePath,
      generatedAt: generatedAt.toISOString(),
      reportDir,
      reportPath: path.join(reportDir, 'report.md'),
      sourceDir,
      archivesDir,
      variants,
    };

    await fs.writeFile(result.reportPath, renderBenchmarkReportMarkdown(result), 'utf8');

    return result;
  } finally {
    await cleanupTempDir(tempDir);
  }
}
