import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { ArchiveInput } from '../types.js';
import { getAdapter } from '../archive/index.js';
import { detectArchiveType } from '../detect.js';
import { MetadataNotFoundError } from '../errors.js';
import { openInputReadStream, inputSize } from '../internal/inputSource.js';
import { locateAsarContentRegion } from './asarContent.js';

async function hashStream(stream: Readable): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

export async function sha256ArchiveEntry(input: ArchiveInput, entryPath: string): Promise<string> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);

  for await (const entry of adapter.listEntries(input)) {
    if (entry.path === entryPath) {
      return hashStream(entry.openReadStream());
    }
  }

  throw new MetadataNotFoundError(`No entry named "${entryPath}" was found in the archive.`);
}

/**
 * SHA256 of the whole archive file — except for asar, where only the
 * content region (bytes after the header) is hashed, so header/index
 * reordering never changes the content hash.
 */
export async function sha256Archive(input: ArchiveInput): Promise<string> {
  const type = await detectArchiveType(input);

  if (type === 'asar') {
    const totalSize = await inputSize(input);
    const { start, end } = await locateAsarContentRegion(input, totalSize);

    return hashStream(openInputReadStream(input, { start, end }));
  }

  return hashStream(openInputReadStream(input));
}
