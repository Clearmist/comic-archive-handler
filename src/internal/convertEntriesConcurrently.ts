import type { ArchiveEntry, ArchiveWriteEntry } from '../archive/types.js';
import type { ImageConcurrency } from '../types.js';
import { streamToBuffer } from './streamUtils.js';

function resolveLimit(concurrency: ImageConcurrency): number {
  const value = typeof concurrency === 'function' ? concurrency() : concurrency;

  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

/**
 * Maps source entries to write entries, running up to `concurrency` image
 * conversions at once while preserving entry order. Each image's bytes are
 * read before the source iterator advances, so adapters whose entry streams
 * are only valid until the next entry keep working. A pass-through entry is
 * yielded only after every earlier conversion has been yielded, and before the
 * source advances, since its content is read lazily by the writer. A function
 * `concurrency` is re-read before each new conversion starts, so the limit can
 * follow the caller's load while the archive is being converted.
 */
export async function* convertEntriesConcurrently(
  source: AsyncIterable<ArchiveEntry>,
  shouldConvert: (entry: ArchiveEntry) => boolean,
  convert: (entry: ArchiveEntry, buffer: Buffer) => Promise<ArchiveWriteEntry>,
  passThrough: (entry: ArchiveEntry) => ArchiveWriteEntry | undefined,
  concurrency: ImageConcurrency = 1,
): AsyncGenerator<ArchiveWriteEntry> {
  const pending: Promise<ArchiveWriteEntry>[] = [];

  try {
    for await (const entry of source) {
      if (shouldConvert(entry)) {
        const buffer = await streamToBuffer(entry.openReadStream());
        const task = convert(entry, buffer);

        // Rejections surface when the task is awaited below; this only keeps a
        // task that fails while still queued from being reported as unhandled.
        task.catch(() => undefined);
        pending.push(task);

        while (pending.length >= resolveLimit(concurrency)) {
          yield await pending.shift()!;
        }

        continue;
      }

      const output = passThrough(entry);

      if (!output) {
        continue;
      }

      while (pending.length > 0) {
        yield await pending.shift()!;
      }

      yield output;
    }

    while (pending.length > 0) {
      yield await pending.shift()!;
    }
  } finally {
    // An early exit (a failed conversion, or the writer stopping) leaves the
    // rest in flight; wait for them so no image work outlives the call.
    await Promise.allSettled(pending);
  }
}
