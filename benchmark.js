#!/usr/bin/env node
// Manual test script for benchmarkArchive(). Run `npm run build` first, then:
//   node benchmark.js <path-to-archive> [--creation-iterations=N] [--seek-samples=N] [--reports-dir=DIR] [--archive-types=zip,tar,asar,7z] [--image-formats=webp,avif,png,jpg]

import cah from './dist/index.mjs';

const filePath = process.argv[2];
const usage = [
  'Usage: node benchmark.js',
  '<path-to-archive>',
  '[--creation-iterations=N]',
  '[--seek-samples=N]',
  '[--reports-dir=DIR]',
  '[--archive-types=zip,tar,asar,7z]',
  '[--image-formats=webp,avif,png,jpg]',
];

if (!filePath) {
  console.error(usage.join(' '));
  process.exit(1);
}

function flag(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function listFlag(name) {
  const value = flag(name, undefined);

  return value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;
}

const options = {
  creationIterations: Number(flag('creation-iterations', '3')),
  seekSamples: Number(flag('seek-samples', '10')),
  reportsDir: flag('reports-dir', undefined),
  archiveTypes: listFlag('archive-types'),
  imageFormats: listFlag('image-formats'),
};

const archiveTypes = options.archiveTypes ?? cah.WRITABLE_ARCHIVE_TYPES;
const imageFormats = options.imageFormats ?? cah.BENCHMARK_IMAGE_FORMATS;

console.log(`Benchmarking "${filePath}"`);
console.log(
  `  creationIterations=${options.creationIterations} seekSamples=${options.seekSamples} archiveTypes=${archiveTypes.join(',')} imageFormats=${imageFormats.join(',')}`,
);
console.log(
  `This creates ${archiveTypes.length * imageFormats.length} archives ` +
    `(${archiveTypes.join('/')} x ${imageFormats.join('/')}) and may take a while...\n`,
);

const start = Date.now();

try {
  const result = await cah.benchmarkArchive(filePath, options);
  const elapsedSeconds = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`Done in ${elapsedSeconds}s. Generated ${result.variants.length} archives.\n`);

  for (const variant of result.variants) {
    const sizeKb = (variant.fileSizeBytes / 1024).toFixed(1);

    console.log(
      `${variant.archiveType.padEnd(5)} ${variant.imageFormat.padEnd(5)} ${variant.fileName.padEnd(18)} ` +
        `${sizeKb.padStart(9)} KB   create ${variant.avgCreationMs.toFixed(2).padStart(8)} ms   read ${variant.avgSeekMs.toFixed(2).padStart(8)} ms`,
    );
  }

  console.log(`\nReport:   ${result.reportPath}`);
  console.log(`Images:   ${result.imagesDir}`);
  console.log(`Archives: ${result.archivesDir}`);
} catch (error) {
  console.error(`\nBenchmark failed: ${error.message}`);
  process.exit(1);
}
