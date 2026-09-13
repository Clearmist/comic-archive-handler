import { PassThrough, type Readable } from 'node:stream';
import { Unzip, UnzipInflate, Zip, ZipDeflate, type UnzipFile } from 'fflate';
import type { ArchiveAdapter, ArchiveEntry } from './types.js';
import { openInputReadStream } from '../internal/inputSource.js';
import { AsyncQueue } from '../internal/streamUtils.js';

function toEntry(file: UnzipFile): ArchiveEntry {
  return {
    path: file.name,
    size: file.originalSize,
    openReadStream(): Readable {
      const pass = new PassThrough();
      file.ondata = (err, data, final) => {
        if (err) {
          pass.destroy(err);
          return;
        }
        if (data.length) {
          pass.write(Buffer.from(data));
        }
        if (final) {
          pass.end();
        }
      };
      file.start();
      return pass;
    },
  };
}

export const zipAdapter: ArchiveAdapter = {
  type: 'zip',
  canWrite: true,

  async *listEntries(input) {
    const source = openInputReadStream(input);
    const queue = new AsyncQueue<ArchiveEntry>();

    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (file) => {
      if (file.name.endsWith('/')) {
        return;
      }
      queue.push(toEntry(file));
    };

    source.on('data', (chunk: Buffer) => unzip.push(new Uint8Array(chunk), false));
    source.on('end', () => {
      unzip.push(new Uint8Array(0), true);
      queue.finish();
    });
    source.on('error', (err) => queue.fail(err));

    yield* queue;
  },

  async write(entries, destination) {
    await new Promise<void>((resolve, reject) => {
      const zip = new Zip((err, data, final) => {
        if (err) {
          destination.destroy(err);
          reject(err);
          return;
        }
        destination.write(Buffer.from(data));
        if (final) {
          destination.end();
          resolve();
        }
      });

      (async () => {
        for await (const entry of entries) {
          const zipFile = new ZipDeflate(entry.path);
          zip.add(zipFile);
          for await (const chunk of entry.content) {
            zipFile.push(new Uint8Array(chunk as Buffer), false);
          }
          zipFile.push(new Uint8Array(0), true);
        }
        zip.end();
      })().catch(reject);
    });
  },
};
