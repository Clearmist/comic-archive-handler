import type { ArchiveInput } from './types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { MetadataNotFoundError } from './errors.js';
import { streamToBuffer } from './internal/streamUtils.js';

export async function readArchiveEntry(input: ArchiveInput, entryPath: string): Promise<Buffer> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);

  for await (const entry of adapter.listEntries(input)) {
    if (entry.path === entryPath) {
      return streamToBuffer(entry.openReadStream());
    }
  }

  throw new MetadataNotFoundError(`No entry named "${entryPath}" was found in the archive.`);
}
