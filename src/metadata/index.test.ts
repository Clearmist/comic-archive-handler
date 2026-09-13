import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { hasComicMetadata, readArchiveMetadata, addMetadataToArchive } from './index.js';
import { listArchiveFiles } from '../listFiles.js';
import { ArchiveFormatError } from '../errors.js';

function sampleZip(): Buffer {
  return Buffer.from(zipSync({ 'page1.jpg': strToU8('fake-image-bytes') }));
}

describe('metadata detection and insertion', () => {
  it('reports absent metadata for a plain archive', async () => {
    const result = await hasComicMetadata(sampleZip());
    expect(result).toEqual({ present: false });
    expect(await readArchiveMetadata(sampleZip())).toBeNull();
  });

  it('adds a ComicInfo.xml when none exists', async () => {
    const withMeta = (await addMetadataToArchive(sampleZip(), { title: 'Added' }, 'ComicInfo')) as Buffer;
    const files = await listArchiveFiles(withMeta);
    expect(files).toContain('ComicInfo.xml');

    const detected = await hasComicMetadata(withMeta);
    expect(detected).toEqual({ present: true, schema: 'ComicInfo', path: 'ComicInfo.xml' });

    const read = await readArchiveMetadata(withMeta);
    expect(read?.schema).toBe('ComicInfo');
    expect(read?.metadata.title).toBe('Added');
  });

  it('adds a MetronInfo.xml when requested', async () => {
    const withMeta = (await addMetadataToArchive(sampleZip(), { series: 'Added Series' }, 'MetronInfo')) as Buffer;
    const detected = await hasComicMetadata(withMeta);
    expect(detected.schema).toBe('MetronInfo');
    expect(detected.path).toBe('MetronInfo.xml');
  });

  it('refuses to overwrite existing metadata unless { overwrite: true } is passed', async () => {
    const withMeta = (await addMetadataToArchive(sampleZip(), { title: 'First' }, 'ComicInfo')) as Buffer;
    await expect(addMetadataToArchive(withMeta, { title: 'Second' }, 'ComicInfo')).rejects.toThrow(ArchiveFormatError);

    const overwritten = (await addMetadataToArchive(withMeta, { title: 'Second' }, 'ComicInfo', {
      overwrite: true,
    })) as Buffer;
    const read = await readArchiveMetadata(overwritten);
    expect(read?.metadata.title).toBe('Second');
  });

  it('cross-schema conversion is intentionally lossy', async () => {
    const withComicInfo = (await addMetadataToArchive(
      sampleZip(),
      { title: 'ComicInfo-only field', series: 'Shared', blackAndWhite: true },
      'ComicInfo',
    )) as Buffer;
    const read = await readArchiveMetadata(withComicInfo);
    expect(read?.metadata.series).toBe('Shared');

    // Converting the same canonical object to MetronInfo drops ComicInfo-only fields.
    const { metadataToMetronInfoXml, metronInfoXmlToMetadata } = await import('./metronInfo.js');
    const asMetron = metronInfoXmlToMetadata(metadataToMetronInfoXml(read!.metadata));
    expect(asMetron.series).toBe('Shared');
    expect(asMetron.blackAndWhite).toBeUndefined();
  });
});
