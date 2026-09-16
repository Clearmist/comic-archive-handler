import type { BenchmarkArchiveResult, BenchmarkVariantResult } from './types.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function formatMs(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}

function topThree(variants: BenchmarkVariantResult[], key: (variant: BenchmarkVariantResult) => number): BenchmarkVariantResult[] {
  return [...variants].sort((a, b) => key(a) - key(b)).slice(0, 3);
}

/** Ranks by image format rather than by variant: transfer size depends only on image format, not container choice. */
function topThreeImageFormats(variants: BenchmarkVariantResult[]): BenchmarkVariantResult[] {
  const seenFormats = new Set<string>();
  const oneVariantPerFormat = [...variants]
    .sort((a, b) => a.avgImageSizeBytes - b.avgImageSizeBytes)
    .filter((variant) => {
      if (seenFormats.has(variant.imageFormat)) {
        return false;
      }

      seenFormats.add(variant.imageFormat);

      return true;
    });

  return oneVariantPerFormat.slice(0, 3);
}

function renderRankedSection(
  title: string,
  description: string,
  ranked: BenchmarkVariantResult[],
  format: (variant: BenchmarkVariantResult) => string,
): string {
  const lines = ranked.map(
    (variant, index) => `${index + 1}. **${variant.fileName}** (${variant.archiveType}/${variant.imageFormat}): ${format(variant)}`,
  );

  return `### ${title}\n\n${description}\n\n${lines.join('\n')}\n`;
}

function renderImageFormatRankedSection(title: string, description: string, ranked: BenchmarkVariantResult[]): string {
  const lines = ranked.map(
    (variant, index) => `${index + 1}. **${variant.imageFormat}**: ${formatBytes(variant.avgImageSizeBytes)} avg. per page`,
  );

  return `### ${title}\n\n${description}\n\n${lines.join('\n')}\n`;
}

export function renderBenchmarkReportMarkdown(result: BenchmarkArchiveResult): string {
  const { variants } = result;

  const tableHeader =
    '| Archive | Image | File | Storage size | Avg. page size | Pages | Avg. creation time | Avg. random read time |\n| --- | --- | --- | --- | --- | --- | --- | --- |';
  const tableRows = variants
    .map(
      (variant) =>
        `| ${variant.archiveType} | ${variant.imageFormat} | \`${variant.fileName}\` | ${formatBytes(variant.fileSizeBytes)} | ${formatBytes(variant.avgImageSizeBytes)} | ${variant.pageCount} | ${formatMs(variant.avgCreationMs)} | ${formatMs(variant.avgSeekMs)} |`,
    )
    .join('\n');

  const readSpeed = renderRankedSection(
    'Read speed',
    'Fastest average random single-file read time: best for serving individual pages on demand (e.g. a remote reader).',
    topThree(variants, (variant) => variant.avgSeekMs),
    (variant) => formatMs(variant.avgSeekMs),
  );

  const storageSize = renderRankedSection(
    'Storage size',
    'Smallest resulting archive on disk: best when total storage footprint is the priority.',
    topThree(variants, (variant) => variant.fileSizeBytes),
    (variant) => formatBytes(variant.fileSizeBytes),
  );

  const transferSize = renderImageFormatRankedSection(
    'Transfer size',
    'Smallest average individual page: best when the cost of sending a single page over the network is the priority (e.g. a client fetching one page at a time). Depends only on image format, not container choice.',
    topThreeImageFormats(variants),
  );

  const creationSpeed = renderRankedSection(
    'Creation speed',
    'Fastest average archive creation time: best when generating or converting archives on the fly.',
    topThree(variants, (variant) => variant.avgCreationMs),
    (variant) => formatMs(variant.avgCreationMs),
  );

  return [
    '# Archive Benchmark Report',
    '',
    `- Source: \`${result.sourcePath}\``,
    `- Generated: ${result.generatedAt}`,
    `- Variants: ${variants.length}`,
    '',
    '## Results',
    '',
    tableHeader,
    tableRows,
    '',
    '## Summary',
    '',
    readSpeed,
    storageSize,
    transferSize,
    creationSpeed,
  ].join('\n');
}
