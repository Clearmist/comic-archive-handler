import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { renameArchiveImagesSequentially } from './rename.js';
import { listArchiveFiles } from './listFiles.js';
import { sha256ArchiveEntry } from './hashing/sha256.js';

describe('renameArchiveImagesSequentially', () => {
  it('renames images to P##### in natural sort order, leaving non-images untouched', async () => {
    const zip = Buffer.from(
      zipSync({
        'page10.jpg': strToU8('page10'),
        'page2.jpg': strToU8('page2'),
        'page1.jpg': strToU8('page1'),
        'ComicInfo.xml': strToU8('<ComicInfo/>'),
      }),
    );

    const renamed = (await renameArchiveImagesSequentially(zip)) as Buffer;
    const files = (await listArchiveFiles(renamed)).sort();
    expect(files).toEqual(['ComicInfo.xml', 'P00001.jpg', 'P00002.jpg', 'P00003.jpg']);

    // Natural sort: page1 < page2 < page10 (not lexicographic "page1" < "page10" < "page2").
    expect(await sha256ArchiveEntry(renamed, 'P00001.jpg')).toBe(await sha256ArchiveEntry(zip, 'page1.jpg'));
    expect(await sha256ArchiveEntry(renamed, 'P00002.jpg')).toBe(await sha256ArchiveEntry(zip, 'page2.jpg'));
    expect(await sha256ArchiveEntry(renamed, 'P00003.jpg')).toBe(await sha256ArchiveEntry(zip, 'page10.jpg'));
  });

  it('honors custom start and pad options', async () => {
    const zip = Buffer.from(zipSync({ 'a.png': strToU8('a') }));
    const renamed = (await renameArchiveImagesSequentially(zip, { start: 5, pad: 3 })) as Buffer;
    const files = await listArchiveFiles(renamed);
    expect(files).toEqual(['P005.png']);
  });
});
