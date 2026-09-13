#!/usr/bin/env node
// Manual test script for benchmarkArchive(). Run `npm run build` first, then:
//   node benchmark.js <path-to-archive> [--creation-iterations=N] [--seek-samples=N] [--reports-dir=DIR] [--image-formats=webp,png,jpg]

import cah from './dist/index.mjs';

const filePath = process.argv[2];
const usage =
  'Usage: node benchmark.js <path-to-archive> [--creation-iterations=N] [--seek-samples=N] [--reports-dir=DIR] [--image-formats=webp,png,jpg]';

if (!filePath) {
  console.error(usage);
  process.exit(1);
}

function flag(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

const imageFormatsFlag = flag('image-formats', undefined);

const options = {
  creationIterations: Number(flag('creation-iterations', '3')),
  seekSamples: Number(flag('seek-samples', '10')),
  reportsDir: flag('reports-dir', undefined),
  imageFormats: imageFormatsFlag
    ? imageFormatsFlag
        .split(',')
        .map((format) => format.trim())
        .filter(Boolean)
    : undefined,
};

const imageFormats = options.imageFormats ?? cah.BENCHMARK_IMAGE_FORMATS;

console.log(`Benchmarking "${filePath}"`);
console.log(`  creationIterations=${options.creationIterations} seekSamples=${options.seekSamples} imageFormats=${imageFormats.join(',')}`);
console.log(
  `This creates ${cah.WRITABLE_ARCHIVE_TYPES.length * imageFormats.length} archives ` +
    `(${cah.WRITABLE_ARCHIVE_TYPES.join('/')} x ${imageFormats.join('/')}) and may take a while...\n`,
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
  console.log(`Archives: ${result.archivesDir}`);
} catch (error) {
  console.error(`\nBenchmark failed: ${error.message}`);
  process.exit(1);
}
