import * as path from 'node:path';
import type { ArchiveInput } from './types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { isImagePath } from './images/isImage.js';
import { readImageInfo } from './images/dimensions.js';
import { streamToBuffer } from './internal/streamUtils.js';

export interface ArchiveImageInfo {
  /** The entry's file name, without its directory. */
  name: string;
  /** The entry's full path inside the archive. */
  path: string;
  /** Pixel width, or `null` when the entry's contents aren't a readable image. */
  width: number | null;
  /** Pixel height, or `null` when the entry's contents aren't a readable image. */
  height: number | null;
  /** The format detected from the entry's contents (not its extension), or `null` when the contents aren't a readable image. */
  type: string | null;
}

/**
 * Returns the name, path, dimensions, and format of every image entry in an
 * archive, in archive iteration order. Image entries are identified by
 * extension (see `isImagePath`); non-image entries are skipped without being
 * read. Everything is gathered in a single pass over the archive.
 */
export async function readArchiveImageInfo(input: ArchiveInput): Promise<ArchiveImageInfo[]> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const images: ArchiveImageInfo[] = [];

  for await (const entry of adapter.listEntries(input)) {
    if (!isImagePath(entry.path)) {
      continue;
    }

    const info = await readImageInfo(await streamToBuffer(entry.openReadStream()));

    images.push({
      name: path.posix.basename(entry.path.replaceAll('\\', '/')),
      path: entry.path,
      width: info?.width ?? null,
      height: info?.height ?? null,
      type: info?.type ?? null,
    });
  }

  return images;
}
