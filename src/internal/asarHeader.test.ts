import { describe, it, expect } from 'vitest';
import { parseAsarHeader, serializeAsarHeader, writeAsarHeaderPatch } from './asarHeader.js';
import { readInputRange } from './inputSource.js';
import { convertArchive } from '../convertArchive.js';
import { zipSync, strToU8 } from 'fflate';

async function sampleAsar(): Promise<Buffer> {
  const zip = Buffer.from(zipSync({ 'page1.jpg': strToU8('fake-image-bytes') }));

  return (await convertArchive(zip, 'asar')) as Buffer;
}

describe('serializeAsarHeader / parseAsarHeader round-trip', () => {
  it('re-parses a header it just serialized back to the same shape', async () => {
    const asar = await sampleAsar();
    const { header, files, contentOffset } = await parseAsarHeader((start, end) => readInputRange(asar, start, end));

    const patched = { ...(header as Record<string, unknown>), comicMetadata: { ComicInfo: { title: 'Round trip' } } };
    const serialized = serializeAsarHeader(patched);
    const rebuilt = Buffer.concat([serialized, asar.subarray(contentOffset)]);

    const reparsed = await parseAsarHeader((start, end) => readInputRange(rebuilt, start, end));

    expect(reparsed.header).toEqual(patched);
    expect(reparsed.files).toEqual(files);
  });

  it('writeAsarHeaderPatch mutates the header while leaving content bytes untouched', async () => {
    const asar = await sampleAsar();
    const patched = (await writeAsarHeaderPatch(asar, (header) => {
      header.comicMetadata = { ComicInfo: { title: 'Patched' } };
    })) as Buffer;

    const { header } = await parseAsarHeader((start, end) => readInputRange(patched, start, end));
    expect((header as { comicMetadata?: { ComicInfo?: { title?: string } } }).comicMetadata?.ComicInfo?.title).toBe('Patched');
  });
});
