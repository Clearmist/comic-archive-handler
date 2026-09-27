import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { convertArchive } from './convertArchive.js';
import { listArchiveFiles } from './listFiles.js';
import { addMetadataToArchive, readArchiveMetadata } from './metadata/index.js';
import { UnsupportedOperationError, FilesystemAccessError } from './errors.js';

function sampleZip(): Buffer {
  return Buffer.from(
    zipSync({
      'a.txt': strToU8('hello a'),
      'b.txt': strToU8('hello b'),
    }),
  );
}

describe('convertArchive', () => {
  it('round-trips zip -> tar -> asar -> zip preserving file list', async () => {
    const zip = sampleZip();
    const tar = (await convertArchive(zip, 'tar')) as Buffer;
    const asar = (await convertArchive(tar, 'asar')) as Buffer;
    const backToZip = (await convertArchive(asar, 'zip')) as Buffer;
    const files = (await listArchiveFiles(backToZip)).sort();

    expect(files).toEqual(['a.txt', 'b.txt']);
  });

  it('round-trips zip -> 7z -> zip preserving file list and content', async () => {
    const zip = sampleZip();
    const sevenZip = (await convertArchive(zip, '7z')) as Buffer;
    const backToZip = (await convertArchive(sevenZip, 'zip')) as Buffer;
    const files = (await listArchiveFiles(backToZip)).sort();

    expect(files).toEqual(['a.txt', 'b.txt']);
  });

  it('throws UnsupportedOperationError when converting to rar', async () => {
    await expect(convertArchive(sampleZip(), 'rar')).rejects.toThrow(UnsupportedOperationError);
  });

  it('throws UnsupportedOperationError when converting to ace', async () => {
    await expect(convertArchive(sampleZip(), 'ace')).rejects.toThrow(UnsupportedOperationError);
  });

  it('streams directly to an output path when options.output is given', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const outPath = path.join(os.tmpdir(), `cah-test-${Date.now()}.tar`);
    const result = await convertArchive(sampleZip(), 'tar', { output: outPath });

    expect(result).toBeUndefined();

    const files = await listArchiveFiles(outPath);

    expect(files.sort()).toEqual(['a.txt', 'b.txt']);

    await fs.rm(outPath, { force: true });
  });

  it('moves replacement metadata into the asar header instead of copying xml entries', async () => {
    const zip = Buffer.from(
      zipSync({
        'page1.jpg': strToU8('fake-image-bytes'),
        'ComicInfo.xml': strToU8('<?xml version="1.0"?><ComicInfo><Title>Old</Title></ComicInfo>'),
        'MetronInfo.xml': strToU8('<?xml version="1.0"?><MetronInfo></MetronInfo>'),
      }),
    );
    const asar = (await convertArchive(zip, 'asar', { metadata: { MetronInfo: { series: 'New' } } })) as Buffer;

    expect(await listArchiveFiles(asar)).toEqual(['page1.jpg']);
    expect(await readArchiveMetadata(asar, 'ComicInfo')).toBeNull();
    expect((await readArchiveMetadata(asar, 'MetronInfo'))?.metadata.series).toBe('New');
  });

  it('writes replacement metadata as xml entries when converting out of asar', async () => {
    const zip = Buffer.from(zipSync({ 'page1.jpg': strToU8('fake-image-bytes') }));
    const asar = (await addMetadataToArchive((await convertArchive(zip, 'asar')) as Buffer, { title: 'Header' }, 'ComicInfo')) as Buffer;
    const backToZip = (await convertArchive(asar, 'zip', { metadata: { ComicInfo: { title: 'Header' } } })) as Buffer;

    expect((await listArchiveFiles(backToZip)).sort()).toEqual(['ComicInfo.xml', 'page1.jpg']);
    expect((await readArchiveMetadata(backToZip, 'ComicInfo'))?.metadata.title).toBe('Header');
  });

  it('throws FilesystemAccessError for asar writes when the given tempDir is not writable', async () => {
    // Root bypasses permission bits.
    if (process.getuid && process.getuid() === 0) {
      return;
    }

    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const readonlyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cah-readonly-'));

    await fs.chmod(readonlyDir, 0o400);

    try {
      await expect(convertArchive(sampleZip(), 'asar', { tempDir: readonlyDir })).rejects.toThrow(FilesystemAccessError);
    } finally {
      await fs.chmod(readonlyDir, 0o755);
      await fs.rm(readonlyDir, { recursive: true, force: true });
    }
  });
});
