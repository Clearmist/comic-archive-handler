import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { removeArchiveEntry } from './removeArchiveEntry.js';
import { listArchiveFiles } from './listFiles.js';
import { readArchiveEntry } from './readArchiveEntry.js';

describe('removeArchiveEntry', () => {
  it('removes the named entry and leaves the rest intact', async () => {
    const zip = Buffer.from(
      zipSync({
        'page1.jpg': strToU8('img'),
        'ComicInfo.xml': strToU8('<ComicInfo/>'),
      }),
    );
    const result = (await removeArchiveEntry(zip, 'ComicInfo.xml')) as Buffer;
    const files = (await listArchiveFiles(result)).sort();

    expect(files).toEqual(['page1.jpg']);
    expect((await readArchiveEntry(result, 'page1.jpg')).toString('utf8')).toBe('img');
  });

  it('throws when the entry is not present', async () => {
    const zip = Buffer.from(zipSync({ 'a.txt': strToU8('hello') }));

    await expect(removeArchiveEntry(zip, 'missing.txt')).rejects.toThrow(/No entry named/);
  });
});
