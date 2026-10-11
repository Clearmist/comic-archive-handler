import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  hasComicMetadata,
  readArchiveMetadata,
  addMetadataToArchive,
  removeComicMetadata,
  readAsarHeaderProperty,
  writeAsarHeaderProperty,
} from './index.js';
import { renameArchiveImagesSequentially } from '../rename.js';
import { stripNonEssentialFiles } from '../strip.js';
import { convertArchive } from '../convertArchive.js';
import { listArchiveFiles } from '../listFiles.js';
import { ArchiveFormatError } from '../errors.js';

async function sampleAsar(): Promise<Buffer> {
  const zip = Buffer.from(zipSync({ 'page1.jpg': strToU8('fake-image-bytes') }));

  return (await convertArchive(zip, 'asar')) as Buffer;
}

describe('asar metadata (header-embedded JSON)', () => {
  it('reports absent metadata for a plain asar archive', async () => {
    const asar = await sampleAsar();

    expect(await hasComicMetadata(asar)).toEqual({ present: false, bothPresent: false });
    expect(await readArchiveMetadata(asar)).toBeNull();
  });

  it('adds ComicInfo metadata to the header without adding a ComicInfo.xml entry', async () => {
    const asar = await sampleAsar();
    const withMeta = (await addMetadataToArchive(asar, { title: 'Added' }, 'ComicInfo')) as Buffer;

    const files = await listArchiveFiles(withMeta);
    expect(files).not.toContain('ComicInfo.xml');
    expect(files).toContain('page1.jpg');

    const detected = await hasComicMetadata(withMeta);
    expect(detected).toEqual({ present: true, schema: 'ComicInfo', bothPresent: false });

    const read = await readArchiveMetadata(withMeta);
    expect(read?.schema).toBe('ComicInfo');
    expect(read?.metadata.title).toBe('Added');
  });

  it('adds MetronInfo metadata alongside ComicInfo when requested', async () => {
    const asar = await sampleAsar();
    const withComicInfo = (await addMetadataToArchive(asar, { title: 'CI' }, 'ComicInfo')) as Buffer;
    const withBoth = (await addMetadataToArchive(withComicInfo, { series: 'MI' }, 'MetronInfo')) as Buffer;

    const comicInfo = await readArchiveMetadata(withBoth);
    expect(comicInfo?.schema).toBe('ComicInfo');
    expect(comicInfo?.metadata.title).toBe('CI');

    const detected = await hasComicMetadata(withBoth);
    expect(detected.bothPresent).toBe(true);

    // The non-preferred schema is only reachable by asking for it explicitly.
    const metronInfo = await readArchiveMetadata(withBoth, 'MetronInfo');
    expect(metronInfo?.schema).toBe('MetronInfo');
    expect(metronInfo?.metadata.series).toBe('MI');
  });

  it('refuses to overwrite existing metadata unless { overwrite: true } is passed', async () => {
    const asar = await sampleAsar();
    const withMeta = (await addMetadataToArchive(asar, { title: 'First' }, 'ComicInfo')) as Buffer;

    await expect(addMetadataToArchive(withMeta, { title: 'Second' }, 'ComicInfo')).rejects.toThrow(ArchiveFormatError);

    const overwritten = (await addMetadataToArchive(withMeta, { title: 'Second' }, 'ComicInfo', {
      overwrite: true,
    })) as Buffer;
    const read = await readArchiveMetadata(overwritten);

    expect(read?.metadata.title).toBe('Second');
  });

  it('removes metadata from the header via removeComicMetadata', async () => {
    const asar = await sampleAsar();
    const withMeta = (await addMetadataToArchive(asar, { title: 'Added' }, 'ComicInfo')) as Buffer;
    const removed = (await removeComicMetadata(withMeta, 'ComicInfo')) as Buffer;

    expect(await hasComicMetadata(removed)).toEqual({ present: false, bothPresent: false });
    const files = await listArchiveFiles(removed);
    expect(files).toContain('page1.jpg');
  });

  it('removeComicMetadata throws when there is nothing to remove', async () => {
    const asar = await sampleAsar();

    await expect(removeComicMetadata(asar, 'ComicInfo')).rejects.toThrow(ArchiveFormatError);
  });

  it('keeps header metadata and application properties through a page rename, a strip, and an asar to asar conversion', async () => {
    const asar = await sampleAsar();
    const withMeta = (await addMetadataToArchive(asar, { title: 'Kept' }, 'ComicInfo')) as Buffer;
    const stamped = (await writeAsarHeaderProperty(withMeta, 'comicScrapes', [{ service: 'metron', issueId: 12 }])) as Buffer;

    const rewrites = [
      (await renameArchiveImagesSequentially(stamped)) as Buffer,
      (await stripNonEssentialFiles(stamped)) as Buffer,
      (await convertArchive(stamped, 'asar')) as Buffer,
    ];
    for (const rewritten of rewrites) {
      expect((await readArchiveMetadata(rewritten))?.metadata.title).toBe('Kept');
      expect(await readAsarHeaderProperty(rewritten, 'comicScrapes')).toEqual([{ service: 'metron', issueId: 12 }]);
    }
    expect(await listArchiveFiles(rewrites[0]!)).toEqual(['P00001.jpg']);
  });

  it('reads, replaces, and removes an application header property, and refuses the reserved ones', async () => {
    const asar = await sampleAsar();
    expect(await readAsarHeaderProperty(asar, 'comicScrapes')).toBeUndefined();

    const written = (await writeAsarHeaderProperty(asar, 'comicScrapes', { a: 1 })) as Buffer;
    expect(await readAsarHeaderProperty(written, 'comicScrapes')).toEqual({ a: 1 });
    expect(await listArchiveFiles(written)).toEqual(['page1.jpg']);

    const removed = (await writeAsarHeaderProperty(written, 'comicScrapes', undefined)) as Buffer;
    expect(await readAsarHeaderProperty(removed, 'comicScrapes')).toBeUndefined();

    await expect(writeAsarHeaderProperty(asar, 'files', {})).rejects.toThrow(ArchiveFormatError);
    await expect(readAsarHeaderProperty(asar, 'comicMetadata')).rejects.toThrow(ArchiveFormatError);
    const zip = Buffer.from(zipSync({ 'page1.jpg': strToU8('fake-image-bytes') }));
    expect(await readAsarHeaderProperty(zip, 'comicScrapes')).toBeUndefined();
    await expect(writeAsarHeaderProperty(zip, 'comicScrapes', 1)).rejects.toThrow(ArchiveFormatError);
  });
});
