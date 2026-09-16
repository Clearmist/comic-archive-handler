import type { ArchiveInput } from '../types.js';
import { parseAsarHeader } from '../internal/asarHeader.js';
import { readInputRange } from '../internal/inputSource.js';

/**
 * Locates the byte range of an asar archive's content region (everything
 * after the header), so it can be hashed without the header/index, meaning
 * header-only changes (e.g. re-ordering the file index) never change the
 * content hash.
 */
export async function locateAsarContentRegion(input: ArchiveInput, totalSize: number): Promise<{ start: number; end: number }> {
  const { contentOffset } = await parseAsarHeader((start, end) => readInputRange(input, start, end));

  return { start: contentOffset, end: totalSize };
}
