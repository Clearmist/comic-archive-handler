import { createHash } from 'node:crypto';
import type { ArchiveInput } from './types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';

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
export async function* readArchiveEntries(input: ArchiveInput): AsyncGenerator<ReadArchiveEntriesResult> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);

  for await (const entry of adapter.listEntries(input)) {
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];

    for await (const chunk of entry.openReadStream()) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      hash.update(buffer);
    }

    yield {
      path: entry.path,
      size: entry.size,
      buffer: Buffer.concat(chunks),
      sha256: hash.digest('hex'),
    };
  }
}
