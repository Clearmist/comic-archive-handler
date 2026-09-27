import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { zipSync, strToU8 } from 'fflate';
import { readArchiveImageInfo } from './readArchiveImageInfo.js';

function solidImage(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } });
}

function bmp(width: number, height: number): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const buffer = Buffer.alloc(54 + rowSize * height);
  buffer.write('BM', 0, 'latin1');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(-height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  return buffer;
}

describe('readArchiveImageInfo', () => {
  it('returns the name, path, dimensions, and type of each image entry', async () => {
    const zip = Buffer.from(
      zipSync({
        'pages/P00001.jpg': new Uint8Array(await solidImage(40, 60).jpeg().toBuffer()),
        'ComicInfo.xml': strToU8('<ComicInfo />'),
        'pages/P00002.png': new Uint8Array(await solidImage(20, 10).png().toBuffer()),
        'P00003.bmp': new Uint8Array(bmp(7, 9)),
      }),
    );

    expect(await readArchiveImageInfo(zip)).toEqual([
      { name: 'P00001.jpg', path: 'pages/P00001.jpg', width: 40, height: 60, type: 'jpeg' },
      { name: 'P00002.png', path: 'pages/P00002.png', width: 20, height: 10, type: 'png' },
      { name: 'P00003.bmp', path: 'P00003.bmp', width: 7, height: 9, type: 'bmp' },
    ]);
  });

  it('reports the type from the contents rather than the extension', async () => {
    const zip = Buffer.from(zipSync({ 'P00001.jpg': new Uint8Array(await solidImage(5, 5).webp().toBuffer()) }));

    expect(await readArchiveImageInfo(zip)).toEqual([{ name: 'P00001.jpg', path: 'P00001.jpg', width: 5, height: 5, type: 'webp' }]);
  });

  it('reports null dimensions and type for an unreadable image entry', async () => {
    const zip = Buffer.from(zipSync({ 'broken.png': strToU8('not an image') }));

    expect(await readArchiveImageInfo(zip)).toEqual([{ name: 'broken.png', path: 'broken.png', width: null, height: null, type: null }]);
  });

  it('returns an empty list when the archive has no images', async () => {
    const zip = Buffer.from(zipSync({ 'ComicInfo.xml': strToU8('<ComicInfo />') }));

    expect(await readArchiveImageInfo(zip)).toEqual([]);
  });
});
