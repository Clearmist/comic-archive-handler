import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { stripNonEssentialFiles } from './strip.js';
import { listArchiveFiles } from './listFiles.js';

describe('stripNonEssentialFiles', () => {
  it('keeps only image and xml entries by default', async () => {
    const zip = Buffer.from(
      zipSync({
        'page1.jpg': strToU8('img'),
        'ComicInfo.xml': strToU8('<ComicInfo/>'),
        'notes.txt': strToU8('irrelevant'),
        'thumbs.db': strToU8('junk'),
      }),
    );
    const stripped = (await stripNonEssentialFiles(zip)) as Buffer;
    const files = (await listArchiveFiles(stripped)).sort();
    expect(files).toEqual(['ComicInfo.xml', 'page1.jpg']);
  });

  it('keeps additional extensions when extraKeepExtensions is given', async () => {
    const zip = Buffer.from(
      zipSync({
        'page1.jpg': strToU8('img'),
        'metadata.json': strToU8('{}'),
      }),
    );
    const stripped = (await stripNonEssentialFiles(zip, { extraKeepExtensions: ['json'] })) as Buffer;
    const files = (await listArchiveFiles(stripped)).sort();
    expect(files).toEqual(['metadata.json', 'page1.jpg']);
  });
});
