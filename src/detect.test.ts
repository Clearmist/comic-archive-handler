import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { detectArchiveType, isZip, isTar, isAsar, is7z, isRar, isAce } from './detect.js';
import { convertArchive } from './convertArchive.js';

function sampleZip(): Buffer {
  return Buffer.from(zipSync({ 'a.txt': strToU8('hello') }));
}

describe('detectArchiveType', () => {
  it('detects zip', async () => {
    const zip = sampleZip();
    expect(await detectArchiveType(zip)).toBe('zip');
    expect(await isZip(zip)).toBe(true);
  });

  it('detects tar', async () => {
    const tar = await convertArchive(sampleZip(), 'tar');
    expect(await detectArchiveType(tar as Buffer)).toBe('tar');
    expect(await isTar(tar as Buffer)).toBe(true);
  });

  it('detects asar', async () => {
    const asar = await convertArchive(sampleZip(), 'asar');
    expect(await detectArchiveType(asar as Buffer)).toBe('asar');
    expect(await isAsar(asar as Buffer)).toBe(true);
  });

  it('detects 7z', async () => {
    const sevenZip = await convertArchive(sampleZip(), '7z');
    expect(await detectArchiveType(sevenZip as Buffer)).toBe('7z');
    expect(await is7z(sevenZip as Buffer)).toBe(true);
  });

  it('detects ace', async () => {
    // ACE has no in-process encoder to generate a real sample from (see
    // src/archive/ace.ts), so this constructs the minimal magic-byte
    // signature file-type checks for: "**ACE**" at byte offset 7.
    const ace = Buffer.alloc(20);
    ace.write('**ACE**', 7, 'ascii');
    expect(await detectArchiveType(ace)).toBe('ace');
    expect(await isAce(ace)).toBe(true);
  });

  it('returns unknown for garbage bytes', async () => {
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]);
    expect(await detectArchiveType(garbage)).toBe('unknown');
    expect(await isRar(garbage)).toBe(false);
  });

  it('does not misdetect a zip as asar', async () => {
    expect(await isAsar(sampleZip())).toBe(false);
  });
});
