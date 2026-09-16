import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { hasComicMetadata, readArchiveMetadata, addMetadataToArchive, removeComicMetadata } from './index.js';
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
});
