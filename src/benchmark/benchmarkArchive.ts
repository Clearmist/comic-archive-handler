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
async function averageConvertedImageSize(preConverted: Buffer, extractDir: string, tempDir: string): Promise<number> {
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
 * `RangeError` if `options.archiveTypes` or `options.imageFormats` is empty
 * or names an unsupported value.
 */
export async function benchmarkArchive(filePath: string, options: BenchmarkArchiveOptions = {}): Promise<BenchmarkArchiveResult> {
  try {
    await fs.access(filePath);
  } catch {
    throw new FilesystemAccessError(`No file exists at "${filePath}".`);
  }

  const creationIterations = Math.max(1, options.creationIterations ?? 3);
  const seekSamples = Math.max(1, options.seekSamples ?? 10);
  const archiveTypes = options.archiveTypes ?? WRITABLE_ARCHIVE_TYPES;
  const imageFormats = options.imageFormats ?? BENCHMARK_IMAGE_FORMATS;

  if (archiveTypes.length === 0) {
    throw new RangeError('options.archiveTypes must include at least one archive type.');
  }

  const unsupportedArchiveTypes = archiveTypes.filter((type) => !WRITABLE_ARCHIVE_TYPES.includes(type));

  if (unsupportedArchiveTypes.length > 0) {
    throw new RangeError(
      `Unsupported archive type(s): ${unsupportedArchiveTypes.join(', ')}. Supported types: ${WRITABLE_ARCHIVE_TYPES.join(', ')}.`,
    );
  }

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
    const imagesDir = path.join(reportDir, 'images');
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
      // Extracted under the report directory so each format's converted
      // pages can be inspected alongside the source pages.
      const avgImageSizeBytes = await averageConvertedImageSize(preConverted, path.join(imagesDir, imageFormat), tempDir);

      for (const archiveType of archiveTypes) {
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
      imagesDir,
      archivesDir,
      variants,
    };

    await fs.writeFile(result.reportPath, renderBenchmarkReportMarkdown(result), 'utf8');

    return result;
  } finally {
    await cleanupTempDir(tempDir);
  }
}
