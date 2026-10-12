import type { ArchiveInput, RenameOptions } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { carriedHeaderProperties } from './internal/asarHeader.js';
import { withOutput } from './internal/collectOutput.js';
import { isImagePath, getExtension } from './images/isImage.js';
import { sequentialImageStems } from './internal/entryCleanup.js';

/**
 * Renames image entries to the standard `P#####` pattern in natural sort
 * order of their current names, leaving non-image entries (like
 * ComicInfo.xml/MetronInfo.xml) untouched.
 *
 * This requires two passes over the archive: `listEntries` is called once to
 * collect image paths (metadata only, no content is read, so no
 * decompression work is wasted) to compute the sort-order rename map, then
 * called again to stream entries out under their new names. `listEntries` is
 * re-invoked from the start for the second pass rather than reusing entry
 * objects collected in the first, since the sequential/CLI-driven adapters
 * (rar, 7z, ace, tar) can't be "rewound" mid-read even though zip and asar
 * could serve both passes from the entries collected the first time round.
 */
export async function renameArchiveImagesSequentially(input: ArchiveInput, options: RenameOptions = {}): Promise<Buffer | void> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const imagePaths: string[] = [];

  for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
    if (isImagePath(entry.path)) {
      imagePaths.push(entry.path);
    }
  }

  const stems = sequentialImageStems(imagePaths, options);

  async function* output(): AsyncGenerator<ArchiveWriteEntry> {
    for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
      const stem = stems.get(entry.path);
      const newPath = stem ? `${stem}.${getExtension(entry.path)}` : entry.path;

      yield { path: newPath, size: entry.size, content: entry.openReadStream() };
    }
  }

  // An asar archive keeps its metadata in the header, which a rewrite has to carry over.
  const carried = await carriedHeaderProperties(input, type);

  return withOutput(options.output, (destination) => adapter.write(output(), destination, { tempDir: options.tempDir, ...carried }));
}
