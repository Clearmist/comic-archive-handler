import type { ArchiveType, ImageConvertOptions, ImageOutputFormat } from '../types.js';

/** Archive container formats that can actually be written (excludes 'rar', 'ace', and 'unknown'). */
export type WritableArchiveType = Extract<ArchiveType, 'zip' | 'tar' | 'asar' | '7z'>;

export const WRITABLE_ARCHIVE_TYPES: readonly WritableArchiveType[] = ['zip', 'tar', 'asar', '7z'];

export const BENCHMARK_IMAGE_FORMATS: readonly ImageOutputFormat[] = ['webp', 'png', 'jpg'];

/** Conventional comic archive extension for each writable container format. */
export const ARCHIVE_TYPE_EXTENSIONS: Record<WritableArchiveType, string> = {
  zip: 'cbz',
  tar: 'cbt',
  asar: 'cbas',
  '7z': 'cb7',
};

export interface BenchmarkArchiveOptions {
  /** Staging directory for extraction and any asar/7z operations. Defaults to a fresh directory under the OS temp dir. */
  tempDir?: string;
  /** Directory the dated report subdirectory is created under. Defaults to "./reports" (relative to `process.cwd()`). */
  reportsDir?: string;
  /** Number of timed archive-creation runs to average per variant. Defaults to 3, minimum 1. */
  creationIterations?: number;
  /** Number of random single-entry reads to average per variant. Defaults to 10, minimum 1. */
  seekSamples?: number;
  /** Image formats to benchmark. Defaults to all of `BENCHMARK_IMAGE_FORMATS` (webp, png, jpg). Must be non-empty. */
  imageFormats?: ImageOutputFormat[];
  /** Image encode options applied uniformly across every generated variant. */
  image?: ImageConvertOptions;
}

export interface BenchmarkVariantResult {
  archiveType: WritableArchiveType;
  imageFormat: ImageOutputFormat;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  pageCount: number;
  /** Average size of one image entry after conversion, in bytes. Independent of container choice for a given image format. */
  avgImageSizeBytes: number;
  /** Average wall-clock time to create this archive, in milliseconds. */
  avgCreationMs: number;
  /** Average wall-clock time to read one random image entry, in milliseconds. */
  avgSeekMs: number;
}

export interface BenchmarkArchiveResult {
  sourcePath: string;
  /** ISO 8601 timestamp of when the benchmark run started. */
  generatedAt: string;
  reportDir: string;
  reportPath: string;
  /** Every entry from the source archive, extracted here for inspection. */
  sourceDir: string;
  archivesDir: string;
  variants: BenchmarkVariantResult[];
}
