import type { ArchiveInput, RemoveEntryOptions } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { MetadataNotFoundError } from './errors.js';
import { withOutput } from './internal/collectOutput.js';

export async function removeArchiveEntry(input: ArchiveInput, entryPath: string, options: RemoveEntryOptions = {}): Promise<Buffer | void> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);

  let found = false;

  for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
    if (entry.path === entryPath) {
      found = true;
      break;
    }
  }

  if (!found) {
    throw new MetadataNotFoundError(`No entry named "${entryPath}" was found in the archive.`);
  }

  async function* output(): AsyncGenerator<ArchiveWriteEntry> {
    for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
      if (entry.path === entryPath) {
        continue;
      }

      yield { path: entry.path, size: entry.size, content: entry.openReadStream() };
    }
  }

  return withOutput(options.output, (destination) => adapter.write(output(), destination, { tempDir: options.tempDir }));
}
