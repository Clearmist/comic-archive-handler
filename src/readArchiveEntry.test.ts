import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readArchiveEntry } from './readArchiveEntry.js';

describe('readArchiveEntry', () => {
  it('returns the raw bytes of the named entry', async () => {
    const content = 'hello world';
    const zip = Buffer.from(zipSync({ 'a.txt': strToU8(content) }));
    const buffer = await readArchiveEntry(zip, 'a.txt');

    expect(buffer.toString('utf8')).toBe(content);
  });

  it('throws when the entry is not present', async () => {
    const zip = Buffer.from(zipSync({ 'a.txt': strToU8('hello') }));

    await expect(readArchiveEntry(zip, 'missing.txt')).rejects.toThrow(/No entry named/);
  });
});
