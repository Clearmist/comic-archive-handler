import { Readable } from 'node:stream';
import * as tarStream from 'tar-stream';
import type { ArchiveAdapter } from './types.js';
import { openInputReadStream } from '../internal/inputSource.js';
import { streamToBuffer } from '../internal/streamUtils.js';

/**
 * tar-stream v3 is built on `streamx`, not Node's native streams; its
 * `extract()` result is directly async-iterable over per-entry streams, and
 * both directions interop with Node streams via `.pipe()`. Each entry's
 * content is buffered fully before being yielded — bounded by a single
 * entry's size (one comic page), not the whole archive — since the
 * underlying iterator only advances once the current entry is drained,
 * which doesn't reconcile with this package's lazily-pulled
 * `ArchiveEntry.openReadStream()` contract.
 */
export const tarAdapter: ArchiveAdapter = {
  type: 'tar',
  canWrite: true,

  async *listEntries(input) {
    const source = openInputReadStream(input);
    const extract = tarStream.extract();
    source.pipe(extract as unknown as NodeJS.WritableStream);

    for await (const entryStream of extract) {
      const header = entryStream.header;
      const buffer = await streamToBuffer(entryStream as unknown as AsyncIterable<Buffer>);
      if (header.type === 'directory') {
        continue;
      }
      yield {
        path: header.name,
        size: buffer.length,
        openReadStream: () => Readable.from(buffer),
      };
    }
  },

  async write(entries, destination) {
    const pack = tarStream.pack();
    pack.pipe(destination as unknown as NodeJS.WritableStream);

    for await (const entry of entries) {
      const buffer = await streamToBuffer(entry.content);
      await new Promise<void>((resolve, reject) => {
        pack.entry({ name: entry.path, size: buffer.length }, buffer, (err) => (err ? reject(err) : resolve()));
      });
    }
    pack.finalize();

    await new Promise<void>((resolve, reject) => {
      destination.on('finish', resolve);
      destination.on('error', reject);
    });
  },
};
