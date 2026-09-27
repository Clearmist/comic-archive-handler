import type { ArchiveInput } from './types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { isImagePath } from './images/isImage.js';
import { findImageStructureProblem } from './images/integrity.js';
import { streamToBuffer } from './internal/streamUtils.js';

export interface CorruptArchiveImage {
  /** The entry's full path inside the archive. */
  path: string;
  /** Why the entry can't be trusted to convert cleanly. */
  reason: string;
}

/**
 * Checks the structure of every image entry in an archive without decoding
 * any pixels (see `findImageStructureProblem`), and returns the entries with
 * a problem, in archive iteration order; an empty array means every image
 * passed. Image entries are identified by extension (see `isImagePath`), and
 * non-image entries are skipped without being read. Cheap enough to run
 * before accepting an archive for image conversion. Damage inside a JPEG's
 * image data can only be found by decoding it, which `convertImageBuffer`
 * does as it converts.
 */
export async function findCorruptArchiveImages(input: ArchiveInput): Promise<CorruptArchiveImage[]> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const corrupt: CorruptArchiveImage[] = [];

  for await (const entry of adapter.listEntries(input)) {
    if (!isImagePath(entry.path)) {
      continue;
    }

    const reason = findImageStructureProblem(await streamToBuffer(entry.openReadStream()));

    if (reason) {
      corrupt.push({ path: entry.path, reason });
    }
  }

  return corrupt;
}
