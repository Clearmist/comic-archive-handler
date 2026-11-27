import type { ArchiveInput } from './types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { isImagePath } from './images/isImage.js';
import { findDecodedImageProblem, findImageStructureProblem } from './images/integrity.js';
import { streamToBuffer } from './internal/streamUtils.js';

export interface CorruptArchiveImage {
  /** The entry's full path inside the archive. */
  path: string;
  /** Why the entry can't be trusted to convert cleanly. */
  reason: string;
}

export interface FindCorruptArchiveImagesOptions {
  /**
   * Also decode every image that passes the structure check (see
   * `findDecodedImageProblem`), which finds damage inside the image data
   * too. Much slower: every page's pixels are decoded.
   */
  decode?: boolean;
}

/** The `reason` given for an entry whose data couldn't be read out of the archive at all. */
export function unreadableEntryReason(error: unknown): string {
  return `unreadable: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Checks the structure of every image entry in an archive without decoding
 * any pixels (see `findImageStructureProblem`), and returns the entries with
 * a problem, in archive iteration order; an empty array means every image
 * passed. Image entries are identified by extension (see `isImagePath`), and
 * non-image entries are skipped without being read. Cheap enough to run
 * before accepting an archive for image conversion. Damage inside a JPEG's
 * image data can only be found by decoding it (`options.decode`, or
 * `convertImageBuffer` as it converts).
 *
 * An entry whose data can't be read (such as a zip entry that fails to
 * decompress) is reported with an `unreadable: ...` reason, and the entries
 * after it are still checked. An error from the archive's listing itself is
 * thrown: for 7z and tar there is no way past a bad entry (see
 * `readArchiveEntries`'s `onEntryError`).
 */
export async function findCorruptArchiveImages(
  input: ArchiveInput,
  options: FindCorruptArchiveImagesOptions = {},
): Promise<CorruptArchiveImage[]> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const corrupt: CorruptArchiveImage[] = [];

  for await (const entry of adapter.listEntries(input)) {
    if (!isImagePath(entry.path)) {
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await streamToBuffer(entry.openReadStream());
    } catch (error) {
      corrupt.push({ path: entry.path, reason: unreadableEntryReason(error) });
      continue;
    }

    const reason = findImageStructureProblem(buffer) ?? (options.decode ? await findDecodedImageProblem(buffer) : null);

    if (reason) {
      corrupt.push({ path: entry.path, reason });
    }
  }

  return corrupt;
}
