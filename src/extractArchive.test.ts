import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { extractArchive } from './extractArchive.js';
import { ArchiveFormatError } from './errors.js';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cah-extract-test-'));

  tempDirs.push(dir);

  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('extractArchive', () => {
  it('writes every entry to disk under destDir, preserving relative paths', async () => {
    const zip = Buffer.from(
      zipSync({
        'ComicInfo.xml': strToU8('<ComicInfo/>'),
        'pages/P00001.jpg': strToU8('page one'),
        'pages/P00002.jpg': strToU8('page two'),
      }),
    );

    const destDir = await makeTempDir();
    const written = await extractArchive(zip, destDir);

    expect(written.sort()).toEqual(['ComicInfo.xml', 'pages/P00001.jpg', 'pages/P00002.jpg'].sort());
    expect(await fs.readFile(path.join(destDir, 'ComicInfo.xml'), 'utf8')).toBe('<ComicInfo/>');
    expect(await fs.readFile(path.join(destDir, 'pages/P00001.jpg'), 'utf8')).toBe('page one');
    expect(await fs.readFile(path.join(destDir, 'pages/P00002.jpg'), 'utf8')).toBe('page two');
  });

  it('creates destDir when it does not already exist', async () => {
    const parent = await makeTempDir();
    const destDir = path.join(parent, 'nested', 'extracted');
    const zip = Buffer.from(zipSync({ 'a.txt': strToU8('hello') }));

    await extractArchive(zip, destDir);

    expect(await fs.readFile(path.join(destDir, 'a.txt'), 'utf8')).toBe('hello');
  });

  it('throws ArchiveFormatError for an undetectable format', async () => {
    const destDir = await makeTempDir();

    await expect(extractArchive(Buffer.from('not an archive'), destDir)).rejects.toThrow(ArchiveFormatError);
  });

  it('rejects zip-slip entries that would escape destDir', async () => {
    const zip = Buffer.from(zipSync({ '../../etc/passwd': strToU8('pwned') }));
    const destDir = await makeTempDir();

    await expect(extractArchive(zip, destDir)).rejects.toThrow(ArchiveFormatError);
  });
});
