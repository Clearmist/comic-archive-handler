import type { ArchiveInput, RenameOptions } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { withOutput } from './internal/collectOutput.js';
import { isImagePath, getExtension } from './images/isImage.js';
import { naturalCompare } from './internal/naturalSort.js';

/**
 * Renames image entries to the standard `P#####` pattern in natural sort
 * order of their current names, leaving non-image entries (like
 * ComicInfo.xml/MetronInfo.xml) untouched.
 *
 * This requires two passes over the archive: `listEntries` is called once to
 * collect image paths (metadata only — no content is read, so no
 * decompression work is wasted) to compute the sort-order rename map, then
 * called again to stream entries out under their new names. Streaming
 * adapters (zip in particular) can't be "rewound" mid-read, so the second
 * pass re-invokes `listEntries` from the start rather than reusing entry
 * objects collected in the first pass.
 */
export async function renameArchiveImagesSequentially(input: ArchiveInput, options: RenameOptions = {}): Promise<Buffer | void> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const pad = options.pad ?? 5;
  const start = options.start ?? 1;

  const imagePaths: string[] = [];
  for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
    if (isImagePath(entry.path)) {
      imagePaths.push(entry.path);
    }
  }
  imagePaths.sort(naturalCompare);

  const renameMap = new Map<string, string>();
  imagePaths.forEach((entryPath, index) => {
    const ext = getExtension(entryPath);
    renameMap.set(entryPath, `P${String(start + index).padStart(pad, '0')}.${ext}`);
  });

  async function* output(): AsyncGenerator<ArchiveWriteEntry> {
    for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
      const newPath = renameMap.get(entry.path) ?? entry.path;
      yield { path: newPath, size: entry.size, content: entry.openReadStream() };
    }
  }

  return withOutput(options.output, (destination) => adapter.write(output(), destination, { tempDir: options.tempDir }));
}
