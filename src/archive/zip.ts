import { Readable } from 'node:stream';
import { Zip, ZipDeflate } from 'fflate';
import type { ArchiveAdapter, ArchiveEntry } from './types.js';
import { parseZipCentralDirectory, readZipEntryData } from '../internal/zipCentralDirectory.js';

export const zipAdapter: ArchiveAdapter = {
  type: 'zip',
  canWrite: true,

  async *listEntries(input) {
    const entries = await parseZipCentralDirectory(input);

    for (const entry of entries) {
      const archiveEntry: ArchiveEntry = {
        path: entry.path,
        size: entry.uncompressedSize,
        openReadStream(): Readable {
          return Readable.from(
            (async function* () {
              yield await readZipEntryData(input, entry);
            })(),
          );
        },
      };

      yield archiveEntry;
    }
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
