import { Readable } from 'node:stream';
import { createExtractorFromData } from 'node-unrar-js';
import type { ArchiveAdapter } from './types.js';
import { UnsupportedOperationError } from '../errors.js';
import { inputToBuffer } from '../internal/inputSource.js';

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * The node-unrar-js package cannot extract entries one at a time (a confirmed
 * limitation); it decodes the whole archive into memory up front. This
 * adapter still exposes the lazily-pulled ArchiveAdapter shape, but does not
 * get the memory-efficiency win the interface provides for zip/tar/asar.
 */
export const rarAdapter: ArchiveAdapter = {
  type: 'rar',
  canWrite: false,

  async *listEntries(input) {
    const buffer = await inputToBuffer(input);
    const extractor = await createExtractorFromData({ data: toArrayBuffer(buffer) });

    const list = extractor.getFileList();
    const names = [...list.fileHeaders].filter((header) => !header.flags.directory).map((header) => header.name);

    const extracted = extractor.extract({ files: names });
    for (const file of extracted.files) {
      if (!file.extraction) {
        continue;
      }
      const data = Buffer.from(file.extraction);
      yield {
        path: file.fileHeader.name,
        size: data.length,
        openReadStream: () => Readable.from(data),
      };
    }
  },

  async write() {
    throw new UnsupportedOperationError(
      'Creating RAR archives is not supported: the UnRAR source license permits decompression only, ' +
        'not building a compatible compressor. Convert to zip, tar, or asar instead.',
    );
  },
};
