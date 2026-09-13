export * from './types.js';
export * from './errors.js';
export * from './detect.js';
export * from './convertArchive.js';
export * from './extractArchive.js';
export * from './metadata/index.js';
export * from './images/convert.js';
export * from './images/phash.js';
export * from './images/isImage.js';
export * from './hashing/sha256.js';
export * from './rename.js';
export * from './strip.js';
export * from './listFiles.js';
export * from './benchmark/index.js';

import * as detectApi from './detect.js';
import { convertArchive } from './convertArchive.js';
import { extractArchive } from './extractArchive.js';
import * as metadataApi from './metadata/index.js';
import { convertImageBuffer, convertArchiveImages } from './images/convert.js';
import { computeImagePHash, phashToHex, computeArchiveImagePHash, hammingDistance } from './images/phash.js';
import { IMAGE_EXTENSIONS, isImagePath } from './images/isImage.js';
import { sha256ArchiveEntry, sha256Archive } from './hashing/sha256.js';
import { renameArchiveImagesSequentially } from './rename.js';
import { stripNonEssentialFiles } from './strip.js';
import { listArchiveFiles } from './listFiles.js';
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
  computeImagePHash,
  phashToHex,
  computeArchiveImagePHash,
  hammingDistance,
  IMAGE_EXTENSIONS,
  isImagePath,
  sha256ArchiveEntry,
  sha256Archive,
  renameArchiveImagesSequentially,
  stripNonEssentialFiles,
  listArchiveFiles,
  benchmarkArchive,
  renderBenchmarkReportMarkdown,
  WRITABLE_ARCHIVE_TYPES,
  BENCHMARK_IMAGE_FORMATS,
  ARCHIVE_TYPE_EXTENSIONS,
};

export default comicArchiveHandler;
