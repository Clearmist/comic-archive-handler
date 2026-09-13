import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { sha256ArchiveEntry, sha256Archive } from './sha256.js';
import { convertArchive } from '../convertArchive.js';

function manualSha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('sha256ArchiveEntry', () => {
  it('matches a manual hash of the same entry bytes', async () => {
    const content = 'hello world';
    const zip = Buffer.from(zipSync({ 'a.txt': strToU8(content) }));
    const hash = await sha256ArchiveEntry(zip, 'a.txt');

    expect(hash).toBe(manualSha256(Buffer.from(content)));
  });
});

describe('sha256Archive', () => {
  it('matches a manual hash of the whole file for non-asar formats', async () => {
    const zip = Buffer.from(zipSync({ 'a.txt': strToU8('hello') }));

    expect(await sha256Archive(zip)).toBe(manualSha256(zip));
  });

  it('for asar, is unaffected by header size changes as long as content bytes are identical', async () => {
    const zipShortNames = Buffer.from(zipSync({ a: strToU8('same content one'), b: strToU8('same content two') }));
    const zipLongNames = Buffer.from(
      zipSync({
        'a-much-longer-file-name-that-changes-header-size': strToU8('same content one'),
        'b-much-longer-file-name-that-changes-header-size': strToU8('same content two'),
      }),
    );

    const asarShort = (await convertArchive(zipShortNames, 'asar')) as Buffer;
    const asarLong = (await convertArchive(zipLongNames, 'asar')) as Buffer;

    // Sanity check the premise: the two asar files really do have different total sizes
    // (different header sizes), yet should hash identically on content alone.
    expect(asarShort.length).not.toBe(asarLong.length);
    expect(await sha256Archive(asarShort)).toBe(await sha256Archive(asarLong));
  });
});
