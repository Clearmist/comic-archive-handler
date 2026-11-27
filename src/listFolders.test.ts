import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { convertArchive } from './convertArchive.js';
import { listArchiveFiles, listArchiveFolders } from './listFiles.js';
import { readArchiveEntries } from './readArchiveEntries.js';

describe('listArchiveFolders', () => {
  it('reports the folder entries of a zip, empty ones included, without the trailing slash', async () => {
    const zip = Buffer.from(zipSync({ 'Empty/': new Uint8Array(), 'Issue/': new Uint8Array(), 'Issue/P00001.jpg': strToU8('a') }));

    expect((await listArchiveFolders(zip)).sort()).toEqual(['Empty', 'Issue']);
    expect(await listArchiveFiles(zip)).toEqual(['Issue/P00001.jpg']);
  });

  it('reports nothing for an archive with every entry at its root', async () => {
    const zip = Buffer.from(zipSync({ 'P00001.jpg': strToU8('a'), 'ComicInfo.xml': strToU8('<ComicInfo/>') }));

    expect(await listArchiveFolders(zip)).toEqual([]);
  });

  it('reports every folder of an asar archive from its header', async () => {
    const zip = Buffer.from(zipSync({ 'a/b/P00001.jpg': strToU8('a') }));
    const asar = (await convertArchive(zip, 'asar')) as Buffer;

    expect((await listArchiveFolders(asar)).sort()).toEqual(['a', 'a/b']);
  });
});

describe('readArchiveEntries onFolder', () => {
  it('reports folders while yielding only file entries', async () => {
    const zip = Buffer.from(zipSync({ 'Empty/': new Uint8Array(), 'P00001.jpg': strToU8('a') }));
    const folders: string[] = [];
    const paths: string[] = [];

    for await (const entry of readArchiveEntries(zip, { onFolder: (folder) => folders.push(folder) })) {
      paths.push(entry.path);
    }

    expect(paths).toEqual(['P00001.jpg']);
    expect(folders).toEqual(['Empty']);
  });
});
