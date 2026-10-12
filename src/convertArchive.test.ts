import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { convertArchive } from './convertArchive.js';
import { listArchiveFiles } from './listFiles.js';
import { readArchiveEntry } from './readArchiveEntry.js';
import { parseZipCentralDirectory } from './internal/zipCentralDirectory.js';
import { noiseImage } from './internal/testImages.js';
import type { ConvertedArchiveEntry } from './types.js';
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

  it('stores already compressed images in a zip and deflates the rest', async () => {
    const text = 'compressible '.repeat(200);
    const source = Buffer.from(
      zipSync({
        'page1.jpg': strToU8(text),
        'page2.WEBP': strToU8(text),
        'page3.bmp': strToU8(text),
        'ComicInfo.xml': strToU8(text),
      }),
    );
    const zip = (await convertArchive((await convertArchive(source, 'tar')) as Buffer, 'zip')) as Buffer;
    const methods = Object.fromEntries((await parseZipCentralDirectory(zip)).map((entry) => [entry.path, entry.compressionMethod]));

    expect(methods).toEqual({ 'page1.jpg': 0, 'page2.WEBP': 0, 'page3.bmp': 8, 'ComicInfo.xml': 8 });

    for (const entryPath of Object.keys(methods)) {
      expect((await readArchiveEntry(zip, entryPath)).toString()).toBe(text);
    }
  });

  it('strips non-essential entries in the same pass', async () => {
    const zip = Buffer.from(
      zipSync({
        'page1.jpg': strToU8('fake-image-bytes'),
        'ComicInfo.xml': strToU8('<ComicInfo/>'),
        'credits.txt': strToU8('scanned by'),
        'Thumbs.db': strToU8('thumbs'),
        'notes.json': strToU8('{}'),
      }),
    );

    expect((await listArchiveFiles((await convertArchive(zip, 'tar', { strip: true })) as Buffer)).sort()).toEqual([
      'ComicInfo.xml',
      'page1.jpg',
    ]);
    expect(
      (await listArchiveFiles((await convertArchive(zip, 'zip', { strip: { extraKeepExtensions: ['json'] } })) as Buffer)).sort(),
    ).toEqual(['ComicInfo.xml', 'notes.json', 'page1.jpg']);
  });

  it('renames images in natural sort order in the same pass, giving a converted page its new extension', async () => {
    const png = new Uint8Array(await noiseImage(16, 16).png());
    const zip = Buffer.from(
      zipSync({
        'scan 10.png': png,
        'scan 2.png': png,
        'scan 1.webp': strToU8('already-webp'),
        'ComicInfo.xml': strToU8('<ComicInfo/>'),
      }),
    );
    const converted = (await convertArchive(zip, 'zip', { image: { format: 'webp' }, renameImages: true })) as Buffer;

    expect((await listArchiveFiles(converted)).sort()).toEqual(['ComicInfo.xml', 'P00001.webp', 'P00002.webp', 'P00003.webp']);
    expect((await readArchiveEntry(converted, 'P00001.webp')).toString()).toBe('already-webp');

    const numbered = (await convertArchive(zip, 'zip', { renameImages: { start: 5, pad: 3 } })) as Buffer;

    expect((await listArchiveFiles(numbered)).sort()).toEqual(['ComicInfo.xml', 'P005.webp', 'P006.png', 'P007.png']);
  });

  it('reports every written entry to onEntry, with the hash of each re-encoded image', async () => {
    const png = new Uint8Array(await noiseImage(16, 16).png());
    const zip = Buffer.from(
      zipSync({
        'b.png': png,
        'a.webp': strToU8('already-webp'),
        'credits.txt': strToU8('scanned by'),
        'ComicInfo.xml': strToU8('<ComicInfo><Title>Old</Title></ComicInfo>'),
      }),
    );
    const written: ConvertedArchiveEntry[] = [];
    const converted = (await convertArchive(zip, 'zip', {
      image: { format: 'webp' },
      strip: true,
      renameImages: true,
      metadata: { ComicInfo: { title: 'New' } },
      onEntry: (entry) => written.push(entry),
    })) as Buffer;

    expect(written.map((entry) => entry.path)).toEqual(await listArchiveFiles(converted));
    expect(written.map(({ path, sourcePath }) => ({ path, sourcePath }))).toEqual([
      { path: 'P00002.webp', sourcePath: 'b.png' },
      { path: 'P00001.webp', sourcePath: 'a.webp' },
      { path: 'ComicInfo.xml', sourcePath: undefined },
    ]);

    const page = await readArchiveEntry(converted, 'P00002.webp');

    expect(written[0]!.reencoded).toEqual({ size: page.length, sha256: createHash('sha256').update(page).digest('hex') });
    expect(written[1]!.reencoded).toBeUndefined();
  });
});
