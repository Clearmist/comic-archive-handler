import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { flattenArchiveFolders, flattenedEntryPaths } from './flatten.js';
import { convertArchive } from './convertArchive.js';
import { listArchiveFiles, listArchiveFolders } from './listFiles.js';
import { sha256ArchiveEntry } from './hashing/sha256.js';

describe('flattenedEntryPaths', () => {
  it('keeps root names and prefixes nested names with their folders', () => {
    const names = flattenedEntryPaths(['ComicInfo.xml', 'Issue 1/01.jpg', 'Issue 1/Extras/02.jpg']);

    expect([...names]).toEqual([
      ['ComicInfo.xml', 'ComicInfo.xml'],
      ['Issue 1/01.jpg', 'Issue 1 - 01.jpg'],
      ['Issue 1/Extras/02.jpg', 'Issue 1 - Extras - 02.jpg'],
    ]);
  });

  it('numbers a name that clashes, ignoring case, and never renames a root entry', () => {
    const names = flattenedEntryPaths(['a/b.jpg', 'A - B.jpg', 'a/B.jpg', 'noext/README']);

    expect(names.get('A - B.jpg')).toBe('A - B.jpg');
    expect(names.get('a/b.jpg')).toBe('a - b (2).jpg');
    expect(names.get('a/B.jpg')).toBe('a - B (3).jpg');
    expect(names.get('noext/README')).toBe('noext - README');
  });

  it('honors a custom separator', () => {
    expect(flattenedEntryPaths(['x/y.png'], '_').get('x/y.png')).toBe('x_y.png');
  });
});

describe('flattenArchiveFolders', () => {
  it('moves every nested entry of a zip to the root, keeping its content', async () => {
    const zip = Buffer.from(
      zipSync({
        'Part 1/': new Uint8Array(),
        'Part 1/01.jpg': strToU8('one'),
        'Part 2/01.jpg': strToU8('two'),
        'ComicInfo.xml': strToU8('<ComicInfo/>'),
      }),
    );

    const flattened = (await flattenArchiveFolders(zip)) as Buffer;
    const files = (await listArchiveFiles(flattened)).sort();

    expect(files).toEqual(['ComicInfo.xml', 'Part 1 - 01.jpg', 'Part 2 - 01.jpg']);
    expect(await sha256ArchiveEntry(flattened, 'Part 1 - 01.jpg')).toBe(await sha256ArchiveEntry(zip, 'Part 1/01.jpg'));
    expect(await sha256ArchiveEntry(flattened, 'Part 2 - 01.jpg')).toBe(await sha256ArchiveEntry(zip, 'Part 2/01.jpg'));
  });

  it('flattens a tar archive', async () => {
    const zip = Buffer.from(zipSync({ 'dir/sub/p.png': strToU8('p'), 'root.png': strToU8('r') }));
    const tar = (await convertArchive(zip, 'tar')) as Buffer;

    const flattened = (await flattenArchiveFolders(tar)) as Buffer;

    expect((await listArchiveFiles(flattened)).sort()).toEqual(['dir - sub - p.png', 'root.png']);
  });

  it('drops empty folders, leaving no folders at all', async () => {
    const zip = Buffer.from(zipSync({ 'Empty/': new Uint8Array(), 'Empty/Deeper/': new Uint8Array(), 'P00001.jpg': strToU8('a') }));

    const flattened = (await flattenArchiveFolders(zip)) as Buffer;

    expect(await listArchiveFiles(flattened)).toEqual(['P00001.jpg']);
    expect(await listArchiveFolders(flattened)).toEqual([]);
  });

  it('leaves an archive with no folders unchanged in content', async () => {
    const zip = Buffer.from(zipSync({ 'P00001.jpg': strToU8('a') }));

    const flattened = (await flattenArchiveFolders(zip)) as Buffer;

    expect(await listArchiveFiles(flattened)).toEqual(['P00001.jpg']);
  });
});
