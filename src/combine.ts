import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ArchiveInput, ArchiveType, CombineArchivesOptions } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { ArchiveFormatError, UnsupportedOperationError } from './errors.js';
import { carriedHeaderProperties } from './internal/asarHeader.js';
import { withOutput } from './internal/collectOutput.js';
import { cleanupTempDir, resolveWritableTempDir } from './internal/tempDir.js';
import { getExtension, isImagePath } from './images/isImage.js';

/**
 * Builds one archive from the pages of two: `options.pages` in the order
 * given, each taken from `target` or `source` and renamed to
 * `P#####.<extension>`, followed by every non-image entry of `target` (its
 * ComicInfo.xml, say) unchanged. An image of either archive that `pages`
 * doesn't name is left out, as is every non-image entry of `source`.
 *
 * The output is written as `options.targetType`, which defaults to the type
 * of `target`. An asar target written as asar keeps its header properties.
 *
 * To reorder (or drop) the pages of a single archive, pass it as both
 * `target` and `source` and take every page `from: 'target'`.
 *
 * The pages can come from both archives in any order, which neither a
 * sequential reader (rar, 7z, tar) nor a streaming writer can serve
 * directly, so the entries kept are staged under a temporary directory
 * first and written from there.
 */
export async function combineArchives(target: ArchiveInput, source: ArchiveInput, options: CombineArchivesOptions): Promise<Buffer | void> {
  const targetSourceType = await detectArchiveType(target);
  const sourceType = await detectArchiveType(source);

  if (targetSourceType === 'unknown' || sourceType === 'unknown') {
    throw new ArchiveFormatError('Could not determine the type of an archive to combine.');
  }

  const outputType: Exclude<ArchiveType, 'unknown'> = options.targetType ?? targetSourceType;
  const outputAdapter = getAdapter(outputType);

  if (!outputAdapter.canWrite) {
    throw new UnsupportedOperationError(`A ${outputType} archive can't be written.`);
  }

  const pad = options.pad ?? 5;
  const start = options.start ?? 1;
  const wanted = { target: new Set<string>(), source: new Set<string>() };

  for (const page of options.pages) {
    if (!isImagePath(page.path)) {
      throw new ArchiveFormatError(`"${page.path}" is not an image entry.`);
    }

    if (wanted[page.from].has(page.path)) {
      throw new ArchiveFormatError(`"${page.path}" of the ${page.from} archive is listed more than once.`);
    }

    wanted[page.from].add(page.path);
  }

  const stagingDir = await resolveWritableTempDir(options.tempDir);

  try {
    let staged = 0;
    const stagedPaths = { target: new Map<string, string>(), source: new Map<string, string>() };
    const keptTargetEntries: string[] = [];

    async function stage(input: ArchiveInput, type: ArchiveType, from: 'target' | 'source'): Promise<void> {
      for await (const entry of getAdapter(type).listEntries(input, { tempDir: options.tempDir })) {
        const keptAsPage = wanted[from].has(entry.path);
        const keptAsOther = from === 'target' && !isImagePath(entry.path);

        if (!keptAsPage && !keptAsOther) {
          continue;
        }

        // Staged under a counter rather than the entry's own path, so nested or oddly named entries need no sanitizing.
        const stagedPath = path.join(stagingDir, String(staged));

        staged += 1;
        await pipeline(entry.openReadStream(), fs.createWriteStream(stagedPath));
        stagedPaths[from].set(entry.path, stagedPath);

        if (keptAsOther) {
          keptTargetEntries.push(entry.path);
        }
      }
    }

    await stage(target, targetSourceType, 'target');

    // Reordering a single archive passes it as both; with no page taken from the source there is nothing to read there.
    if (wanted.source.size > 0) {
      await stage(source, sourceType, 'source');
    }

    for (const page of options.pages) {
      if (!stagedPaths[page.from].has(page.path)) {
        throw new ArchiveFormatError(`The ${page.from} archive has no entry "${page.path}".`);
      }
    }

    async function* entries(): AsyncGenerator<ArchiveWriteEntry> {
      for (const [index, page] of options.pages.entries()) {
        const stagedPath = stagedPaths[page.from].get(page.path)!;
        const size = (await fs.promises.stat(stagedPath)).size;

        yield {
          path: `P${String(start + index).padStart(pad, '0')}.${getExtension(page.path)}`,
          size,
          content: fs.createReadStream(stagedPath),
        };
      }

      for (const entryPath of keptTargetEntries) {
        const stagedPath = stagedPaths.target.get(entryPath)!;
        const size = (await fs.promises.stat(stagedPath)).size;

        yield { path: entryPath, size, content: fs.createReadStream(stagedPath) };
      }
    }

    // An asar archive keeps its metadata in the header, which a rewrite has to carry over.
    const carried = outputType === targetSourceType ? await carriedHeaderProperties(target, targetSourceType) : {};

    return await withOutput(options.output, (destination) =>
      outputAdapter.write(entries(), destination, { tempDir: options.tempDir, ...carried }),
    );
  } finally {
    await cleanupTempDir(stagingDir);
  }
}
