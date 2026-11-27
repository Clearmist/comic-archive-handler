import { createHash } from 'node:crypto';
import type { ArchiveInput } from './types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';

export interface ReadArchiveEntriesOptions {
  /** Called with each folder's path (no trailing `/`), since folders are never yielded as entries; see `listArchiveFolders`. */
  onFolder?: (folderPath: string) => void;
  /**
   * When given, an entry whose data can't be read (such as a zip entry that
   * fails to decompress) is reported here and skipped instead of ending the
   * pass with that error, so the entries after it are still read. An error
   * from the archive's listing itself still ends the pass: for 7z the whole
   * archive is extracted before any entry is listed, and for tar a damaged
   * header stops the stream, so neither can skip past a bad entry.
   */
  onEntryError?: (entryPath: string, error: unknown) => void;
}

export interface ReadArchiveEntriesResult {
  path: string;
  size?: number;
  buffer: Buffer;
  sha256: string;
}

/**
 * Reads every entry's bytes and SHA256 in a single pass over the archive.
 * Calling `readArchiveEntry`/`sha256ArchiveEntry` once per entry instead
 * means re-running `listEntries` and re-locating the target entry on every
 * call: cheap for zip (backed by real central-directory random access) and
 * tar/asar, but for the sequential/CLI-driven formats (rar, 7z, ace) each
 * call re-reads the archive from the start, so reading every entry that way
 * costs O(n^2). This also does half the I/O of calling both
 * `sha256ArchiveEntry` and `readArchiveEntry` per entry, since it computes
 * the hash and buffer from the same read instead of two.
 */
export async function* readArchiveEntries(
  input: ArchiveInput,
  options: ReadArchiveEntriesOptions = {},
): AsyncGenerator<ReadArchiveEntriesResult> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);

  for await (const entry of adapter.listEntries(input, { onFolder: options.onFolder })) {
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];

    try {
      for await (const chunk of entry.openReadStream()) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        hash.update(buffer);
      }
    } catch (error) {
      if (!options.onEntryError) {
        throw error;
      }
      options.onEntryError(entry.path, error);
      continue;
    }

    yield {
      path: entry.path,
      size: entry.size,
      buffer: Buffer.concat(chunks),
      sha256: hash.digest('hex'),
    };
  }
}
