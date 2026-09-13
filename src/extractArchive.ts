import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ArchiveInput } from './types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { resolveSafeEntryPath } from './internal/safePath.js';

export interface ExtractArchiveOptions {
  /** Temporary staging directory for archive formats that require real files to read (7z). */
  tempDir?: string;
}

/**
 * Extracts every entry in an archive to real files under `destDir`,
 * preserving relative paths (`destDir` is created if missing). Throws
 * `ArchiveFormatError` for an undetectable/unknown format, or
 * `UnsupportedOperationError` for ACE. Returns the archive-relative entry
 * paths that were written, in archive iteration order.
 */
export async function extractArchive(input: ArchiveInput, destDir: string, options: ExtractArchiveOptions = {}): Promise<string[]> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  await fs.promises.mkdir(destDir, { recursive: true });

  const written: string[] = [];
  for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
    const target = resolveSafeEntryPath(destDir, entry.path);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await pipeline(entry.openReadStream(), fs.createWriteStream(target));
    written.push(entry.path);
  }
  return written;
}
