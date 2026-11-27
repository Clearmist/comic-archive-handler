import type { ArchiveInput } from './types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';

export async function listArchiveFiles(input: ArchiveInput): Promise<string[]> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const paths: string[] = [];

  for await (const entry of adapter.listEntries(input)) {
    paths.push(entry.path);
  }

  return paths;
}

/**
 * The path (no trailing `/`) of every folder in the archive, empty ones
 * included where the container records them: zip, tar, and rar store a
 * folder as an entry of its own (an archive written without one only shows
 * its folders through the paths of the files in them), while asar and 7z
 * always know every folder. Folders are never part of `listArchiveFiles`.
 */
export async function listArchiveFolders(input: ArchiveInput): Promise<string[]> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
  const folders: string[] = [];

  for await (const _entry of adapter.listEntries(input, { onFolder: (folder) => folders.push(folder) })) {
    // Only the folders are wanted; draining the listing reports them.
  }

  return folders;
}
