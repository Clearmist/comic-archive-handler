import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { listArchiveFiles } from './listFiles.js';

describe('listArchiveFiles', () => {
  it('lists all entries in a zip', async () => {
    const zip = Buffer.from(zipSync({ 'a.txt': strToU8('a'), 'b.txt': strToU8('b') }));

    expect((await listArchiveFiles(zip)).sort()).toEqual(['a.txt', 'b.txt']);
  });
});
