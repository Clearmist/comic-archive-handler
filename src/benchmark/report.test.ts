import { describe, it, expect } from 'vitest';
import { renderBenchmarkReportMarkdown } from './report.js';
import type { BenchmarkArchiveResult, BenchmarkVariantResult } from './types.js';

function variant(overrides: Partial<BenchmarkVariantResult>): BenchmarkVariantResult {
  return {
    archiveType: 'zip',
    imageFormat: 'webp',
    fileName: 'zip-webp.cbz',
    filePath: '/tmp/zip-webp.cbz',
    fileSizeBytes: 1000,
    pageCount: 2,
    avgImageSizeBytes: 500,
    avgCreationMs: 10,
    avgSeekMs: 1,
    ...overrides,
  };
}

function result(variants: BenchmarkVariantResult[]): BenchmarkArchiveResult {
  return {
    sourcePath: '/books/example.cbz',
    generatedAt: '2026-09-12T00:00:00.000Z',
    reportDir: '/reports/2026-09-12T00-00-00Z',
    reportPath: '/reports/2026-09-12T00-00-00Z/report.md',
    sourceDir: '/reports/2026-09-12T00-00-00Z/source',
    archivesDir: '/reports/2026-09-12T00-00-00Z/archives',
    variants,
  };
}

describe('renderBenchmarkReportMarkdown', () => {
  it('includes a results table row per variant', () => {
    const variants = [
      variant({ fileName: 'zip-webp.cbz', fileSizeBytes: 100, avgSeekMs: 5, avgCreationMs: 10 }),
      variant({ fileName: 'tar-png.cbt', archiveType: 'tar', imageFormat: 'png', fileSizeBytes: 200, avgSeekMs: 3, avgCreationMs: 20 }),
    ];
    const markdown = renderBenchmarkReportMarkdown(result(variants));

    expect(markdown).toContain('`zip-webp.cbz`');
    expect(markdown).toContain('`tar-png.cbt`');
    expect(markdown).toContain('## Results');
    expect(markdown).toContain('## Summary');
  });

  it('ranks the top three fastest read, smallest, and fastest to create in the summary', () => {
    const variants = [
      variant({ fileName: 'a', fileSizeBytes: 500, avgSeekMs: 5, avgCreationMs: 50 }),
      variant({ fileName: 'b', fileSizeBytes: 100, avgSeekMs: 1, avgCreationMs: 10 }),
      variant({ fileName: 'c', fileSizeBytes: 300, avgSeekMs: 3, avgCreationMs: 30 }),
      variant({ fileName: 'd', fileSizeBytes: 200, avgSeekMs: 2, avgCreationMs: 20 }),
      variant({ fileName: 'e', fileSizeBytes: 400, avgSeekMs: 4, avgCreationMs: 40 }),
    ];
    const markdown = renderBenchmarkReportMarkdown(result(variants));

    const readSpeedSection = markdown.split('### Read speed')[1]!.split('### Storage size')[0]!;
    expect(readSpeedSection).toContain('**b**');
    expect(readSpeedSection).toContain('**d**');
    expect(readSpeedSection).toContain('**c**');
    expect(readSpeedSection).not.toContain('**a**');
    expect(readSpeedSection).not.toContain('**e**');

    const sizeSection = markdown.split('### Storage size')[1]!.split('### Transfer size')[0]!;
    expect(sizeSection).toContain('**b**');
    expect(sizeSection).toContain('**d**');
    expect(sizeSection).toContain('**c**');
  });

  it('ranks transfer size by image format, deduping containers that share a format', () => {
    const variants = [
      variant({ fileName: 'zip-webp.cbz', archiveType: 'zip', imageFormat: 'webp', avgImageSizeBytes: 300 }),
      variant({ fileName: 'tar-webp.cbt', archiveType: 'tar', imageFormat: 'webp', avgImageSizeBytes: 300 }),
      variant({ fileName: 'zip-png.cbz', archiveType: 'zip', imageFormat: 'png', avgImageSizeBytes: 500 }),
      variant({ fileName: 'tar-png.cbt', archiveType: 'tar', imageFormat: 'png', avgImageSizeBytes: 500 }),
      variant({ fileName: 'zip-jpg.cbz', archiveType: 'zip', imageFormat: 'jpg', avgImageSizeBytes: 200 }),
    ];
    const markdown = renderBenchmarkReportMarkdown(result(variants));

    const transferSection = markdown.split('### Transfer size')[1]!.split('### Creation speed')[0]!;
    expect(transferSection).toContain('**jpg**');
    expect(transferSection).toContain('**webp**');
    expect(transferSection).toContain('**png**');
    expect(transferSection.match(/^\d+\. /gm)).toHaveLength(3);
  });

  it('handles a single variant without error', () => {
    const markdown = renderBenchmarkReportMarkdown(result([variant({})]));
    expect(markdown).toContain('Variants: 1');
  });
});
