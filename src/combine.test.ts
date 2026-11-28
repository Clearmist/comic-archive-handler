import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { combineArchives } from './combine.js';
import { listArchiveFiles } from './listFiles.js';
import { readArchiveEntry } from './readArchiveEntry.js';
import { ArchiveFormatError } from './errors.js';

describe('combineArchives', () => {
  const target = Buffer.from(
    zipSync({
      'a1.jpg': strToU8('a1'),
      'a2.png': strToU8('a2'),
      'ComicInfo.xml': strToU8('<ComicInfo/>'),
    }),
  );
  const source = Buffer.from(
    zipSync({
      'b1.jpg': strToU8('b1'),
      'nested/b2.jpg': strToU8('b2'),
      'ComicInfo.xml': strToU8('<ComicInfo>source</ComicInfo>'),
      'notes.txt': strToU8('notes'),
    }),
  );

  it('writes the listed pages in order as P#####, keeping only the target metadata', async () => {
    const combined = (await combineArchives(target, source, {
      pages: [
        { from: 'source', path: 'nested/b2.jpg' },
        { from: 'target', path: 'a2.png' },
        { from: 'source', path: 'b1.jpg' },
      ],
    })) as Buffer;

    expect((await listArchiveFiles(combined)).sort()).toEqual(['ComicInfo.xml', 'P00001.jpg', 'P00002.png', 'P00003.jpg']);
    expect((await readArchiveEntry(combined, 'P00001.jpg')).toString()).toBe('b2');
    expect((await readArchiveEntry(combined, 'P00002.png')).toString()).toBe('a2');
    expect((await readArchiveEntry(combined, 'P00003.jpg')).toString()).toBe('b1');
    expect((await readArchiveEntry(combined, 'ComicInfo.xml')).toString()).toBe('<ComicInfo/>');
  });

  it('rejects a page that is missing or listed twice', async () => {
    await expect(combineArchives(target, source, { pages: [{ from: 'source', path: 'missing.jpg' }] })).rejects.toBeInstanceOf(
      ArchiveFormatError,
    );
    await expect(
      combineArchives(target, source, {
        pages: [
          { from: 'target', path: 'a1.jpg' },
          { from: 'target', path: 'a1.jpg' },
        ],
      }),
    ).rejects.toBeInstanceOf(ArchiveFormatError);
  });
});
