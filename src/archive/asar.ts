import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { createPackage } from '@electron/asar';
import type { ArchiveAdapter } from './types.js';
import { parseAsarHeader } from '../internal/asarHeader.js';
import { openInputReadStream, readInputRange } from '../internal/inputSource.js';
import { resolveWritableTempDir, cleanupTempDir } from '../internal/tempDir.js';
import { resolveSafeEntryPath } from '../internal/safePath.js';

/**
 * Reads bypass @electron/asar's extract API entirely: the header is parsed
 * directly (src/internal/asarHeader.ts) to get each file's byte offset/size,
 * then entries are read via direct byte-range reads against the archive;
 * no extraction step, no temp directory, for reads.
 *
 * Writes still require a staging directory, since @electron/asar's
 * `createPackage(srcDir, destFile)` only accepts a source directory on
 * disk, not streams or buffers.
 */
export const asarAdapter: ArchiveAdapter = {
  type: 'asar',
  canWrite: true,

  async *listEntries(input) {
    const { files, contentOffset } = await parseAsarHeader((start, end) => readInputRange(input, start, end));

    for (const file of files) {
      const start = contentOffset + file.offset;
      const end = start + file.size;

      yield {
        path: file.path,
        size: file.size,
        openReadStream: () => openInputReadStream(input, { start, end }),
      };
    }
  },

  async write(entries, destination, options) {
    const tempDir = await resolveWritableTempDir(options?.tempDir);
    const stagingDir = path.join(tempDir, 'staging');

    await fsp.mkdir(stagingDir, { recursive: true });

    try {
      for await (const entry of entries) {
        const target = resolveSafeEntryPath(stagingDir, entry.path);

        await fsp.mkdir(path.dirname(target), { recursive: true });
        await new Promise<void>((resolve, reject) => {
          const out = fs.createWriteStream(target);

          entry.content.on('error', reject);
          out.on('error', reject);
          out.on('finish', resolve);
          entry.content.pipe(out);
        });
      }

      const outputFile = path.join(tempDir, 'output.asar');

      await createPackage(stagingDir, outputFile);

      await new Promise<void>((resolve, reject) => {
        const readStream = fs.createReadStream(outputFile);

        readStream.on('error', reject);
        destination.on('error', reject);
        destination.on('finish', resolve);
        readStream.pipe(destination);
      });
    } finally {
      await cleanupTempDir(tempDir);
    }
  },
};
