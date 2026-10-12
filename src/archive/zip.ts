import { Readable } from 'node:stream';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { ArchiveAdapter, ArchiveEntry } from './types.js';
import { parseZipCentralDirectory, readZipEntryData } from '../internal/zipCentralDirectory.js';
import { getExtension } from '../images/isImage.js';

/**
 * Image formats whose data is already compressed. Deflating them again costs
 * CPU on every write, and again on every read, for almost no saving, so
 * these entries are stored as they are. Everything else (xml, and image
 * formats that may hold raw pixels, such as bmp and tiff) is deflated.
 */
const STORED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);

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
      // Resolving only on 'finish' guarantees every byte, including the
      // end-of-central-directory record written last, has been flushed before
      // a caller reads the archive back or renames it into place.
      destination.on('error', reject);
      destination.on('finish', resolve);

      const zip = new Zip((err, data, final) => {
        if (err) {
          destination.destroy(err);

          reject(err);

          return;
        }

        destination.write(Buffer.from(data));

        if (final) {
          destination.end();
        }
      });

      (async () => {
        for await (const entry of entries) {
          const zipFile = STORED_EXTENSIONS.has(getExtension(entry.path)) ? new ZipPassThrough(entry.path) : new ZipDeflate(entry.path);

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
