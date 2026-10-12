import type { ArchiveInput, StripOptions } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { carriedHeaderProperties } from './internal/asarHeader.js';
import { withOutput } from './internal/collectOutput.js';
import { getExtension } from './images/isImage.js';
import { essentialExtensions } from './internal/entryCleanup.js';

export async function stripNonEssentialFiles(input: ArchiveInput, options: StripOptions = {}): Promise<Buffer | void> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const keepExtensions = essentialExtensions(options.extraKeepExtensions);

  async function* output(): AsyncGenerator<ArchiveWriteEntry> {
    for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
      if (!keepExtensions.has(getExtension(entry.path))) {
        continue;
      }

      yield { path: entry.path, size: entry.size, content: entry.openReadStream() };
    }
  }

  // An asar archive keeps its metadata in the header, which a rewrite has to carry over.
  const carried = await carriedHeaderProperties(input, type);

  return withOutput(options.output, (destination) => adapter.write(output(), destination, { tempDir: options.tempDir, ...carried }));
}
