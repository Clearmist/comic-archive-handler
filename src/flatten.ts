import type { ArchiveInput, FlattenOptions } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { carriedHeaderProperties } from './internal/asarHeader.js';
import { withOutput } from './internal/collectOutput.js';

const DEFAULT_SEPARATOR = ' - ';

/** `name` with ` (n)` inserted before its extension, or appended when it has none. */
function numberedName(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
}

/**
 * The root-level name each entry gets when the archive is flattened, keyed
 * by its current path. A root entry keeps its name. A nested entry's name is
 * its path segments joined with `separator`, so `Part 1/01.jpg` becomes
 * `Part 1 - 01.jpg` and pages keep their order when sorted by name. Names are
 * compared case-insensitively, since an archive extracted onto a
 * case-insensitive filesystem would otherwise lose one of two names that
 * differ only by case. A clash gets ` (2)`, ` (3)`, and so on before its
 * extension. Root entries claim their names before any nested entry is
 * given one, so a root entry is never renamed.
 */
export function flattenedEntryPaths(entryPaths: string[], separator = DEFAULT_SEPARATOR): Map<string, string> {
  const taken = new Set<string>();
  const result = new Map<string, string>();

  for (const entryPath of entryPaths) {
    if (!entryPath.includes('/')) {
      result.set(entryPath, entryPath);
      taken.add(entryPath.toLowerCase());
    }
  }

  for (const entryPath of entryPaths) {
    if (result.has(entryPath)) {
      continue;
    }
    const base = entryPath
      .split('/')
      .filter((segment) => segment.length > 0)
      .join(separator);
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) {
      name = numberedName(base, n);
    }
    result.set(entryPath, name);
    taken.add(name.toLowerCase());
  }

  return result;
}

/**
 * Moves every entry inside a folder to the root of the archive, naming it
 * as `flattenedEntryPaths` does, and leaves root entries untouched. Folder
 * entries themselves are not written, so the result has no folders left.
 *
 * Like `renameArchiveImagesSequentially`, this lists the archive twice:
 * once for the names (no content is read) and once to stream the entries
 * out under them, since the sequential adapters can't be rewound.
 */
export async function flattenArchiveFolders(input: ArchiveInput, options: FlattenOptions = {}): Promise<Buffer | void> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const entryPaths: string[] = [];

  for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
    entryPaths.push(entry.path);
  }

  const names = flattenedEntryPaths(entryPaths, options.separator);

  async function* output(): AsyncGenerator<ArchiveWriteEntry> {
    for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
      yield { path: names.get(entry.path) ?? entry.path, size: entry.size, content: entry.openReadStream() };
    }
  }

  // An asar archive keeps its metadata in the header, which a rewrite has to carry over.
  const carried = await carriedHeaderProperties(input, type);

  return withOutput(options.output, (destination) => adapter.write(output(), destination, { tempDir: options.tempDir, ...carried }));
}
