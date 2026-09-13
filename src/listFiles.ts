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
