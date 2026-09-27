export * from './types.js';
export * from './errors.js';
export * from './detect.js';
export * from './convertArchive.js';
export * from './extractArchive.js';
export * from './metadata/index.js';
export * from './images/convert.js';
export * from './images/concurrency.js';
export * from './images/phash.js';
export * from './images/dimensions.js';
export * from './images/isImage.js';
export * from './hashing/sha256.js';
export * from './rename.js';
export * from './strip.js';
export * from './listFiles.js';
export * from './readArchiveEntry.js';
export * from './readArchiveEntries.js';
export * from './readArchiveImageInfo.js';
export * from './removeArchiveEntry.js';
export * from './benchmark/index.js';

import * as detectApi from './detect.js';
import { convertArchive } from './convertArchive.js';
import { extractArchive } from './extractArchive.js';
import * as metadataApi from './metadata/index.js';
import { convertImageBuffer, convertArchiveImages } from './images/convert.js';
import { setImageConcurrency } from './images/concurrency.js';
import { computeImagePHash, phashToHex, computeArchiveImagePHash, hammingDistance } from './images/phash.js';
import { IMAGE_EXTENSIONS, isImagePath } from './images/isImage.js';
import { readImageDimensions, readImageInfo } from './images/dimensions.js';
import { sha256ArchiveEntry, sha256Archive } from './hashing/sha256.js';
import { renameArchiveImagesSequentially } from './rename.js';
import { stripNonEssentialFiles } from './strip.js';
import { listArchiveFiles } from './listFiles.js';
import { readArchiveEntry } from './readArchiveEntry.js';
import { readArchiveEntries } from './readArchiveEntries.js';
import { readArchiveImageInfo } from './readArchiveImageInfo.js';
import { removeArchiveEntry } from './removeArchiveEntry.js';
import {
  benchmarkArchive,
  renderBenchmarkReportMarkdown,
  WRITABLE_ARCHIVE_TYPES,
  BENCHMARK_IMAGE_FORMATS,
  ARCHIVE_TYPE_EXTENSIONS,
} from './benchmark/index.js';

const comicArchiveHandler = {
  ...detectApi,
  convertArchive,
  extractArchive,
  ...metadataApi,
  convertImageBuffer,
  convertArchiveImages,
  setImageConcurrency,
  computeImagePHash,
  phashToHex,
  computeArchiveImagePHash,
  hammingDistance,
  IMAGE_EXTENSIONS,
  isImagePath,
  readImageDimensions,
  readImageInfo,
  sha256ArchiveEntry,
  sha256Archive,
  renameArchiveImagesSequentially,
  stripNonEssentialFiles,
  listArchiveFiles,
  readArchiveEntry,
  readArchiveEntries,
  readArchiveImageInfo,
  removeArchiveEntry,
  benchmarkArchive,
  renderBenchmarkReportMarkdown,
  WRITABLE_ARCHIVE_TYPES,
  BENCHMARK_IMAGE_FORMATS,
  ARCHIVE_TYPE_EXTENSIONS,
};

export default comicArchiveHandler;
