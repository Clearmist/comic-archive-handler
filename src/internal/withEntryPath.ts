import { CorruptImageError } from '../errors.js';

/** Names the archive entry on a `CorruptImageError` raised while converting it; other errors pass through unchanged. */
export function withEntryPath(error: unknown, entryPath: string): unknown {
  return error instanceof CorruptImageError && !error.entryPath ? new CorruptImageError(error.reason, entryPath) : error;
}
