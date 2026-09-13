import type { ArchiveInput, StripOptions } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { withOutput } from './internal/collectOutput.js';
import { IMAGE_EXTENSIONS, getExtension } from './images/isImage.js';

export async function stripNonEssentialFiles(input: ArchiveInput, options: StripOptions = {}): Promise<Buffer | void> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const keepExtensions = new Set<string>(
    [...IMAGE_EXTENSIONS, 'xml', ...(options.extraKeepExtensions ?? [])].map((ext) => ext.toLowerCase()),
  );

  async function* output(): AsyncGenerator<ArchiveWriteEntry> {
    for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
      if (!keepExtensions.has(getExtension(entry.path))) {
        continue;
      }
      yield { path: entry.path, size: entry.size, content: entry.openReadStream() };
    }
  }

  return withOutput(options.output, (destination) => adapter.write(output(), destination, { tempDir: options.tempDir }));
}
