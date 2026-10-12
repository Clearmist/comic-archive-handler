import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { createExtractorFromFile, type ArcFile, type Extractor } from 'node-unrar-js';
import type { ArchiveAdapter } from './types.js';
import { ArchiveFormatError, UnsupportedOperationError } from '../errors.js';
import { isPathInput } from '../internal/inputSource.js';
import { resolveWritableTempDir, cleanupTempDir } from '../internal/tempDir.js';

const INPUT_FILE_NAME = 'input.rar';
const EXTRACTED_FILE_NAME = 'entry.bin';

/**
 * The node-unrar-js package routes the wasm module's file callbacks through
 * one shared `extractor` slot that only `createExtractorFromFile` assigns.
 * Each step below runs synchronously, so claiming the slot right before a
 * step keeps two archives that are being read in turns from writing into
 * each other's staging directory.
 */
function activate(extractor: Extractor): void {
  (extractor as unknown as { unrar: { extractor: Extractor } }).unrar.extractor = extractor;
}

/**
 * Reads the archive from disk through node-unrar-js's file extractor, so
 * neither the archive nor its decompressed contents are ever held in memory
 * as a whole: listing only walks the entry headers, and an entry is
 * decompressed (through a staging file) when its `openReadStream()` is
 * called, which then holds that one entry's bytes. A Buffer input is first
 * written to the staging directory.
 *
 * Entries opened in archive order share a single pass over the archive. An
 * entry opened out of order (or a second time) starts a new pass, and a pass
 * that is abandoned part-way is walked to its end to release the archive;
 * both are cheap header seeks for ordinary archives, but cost a decompression
 * pass for solid ones. Entries can only be opened while the listing is still
 * being iterated.
 */
export const rarAdapter: ArchiveAdapter = {
  type: 'rar',
  canWrite: false,

  async *listEntries(input, options) {
    let tempDir: string | undefined;
    let tempDirError: unknown;
    try {
      tempDir = await resolveWritableTempDir(options?.tempDir);
    } catch (error) {
      // Listing a file on disk needs no staging directory; only fail once an
      // entry is actually opened.
      if (!isPathInput(input)) {
        throw error;
      }
      tempDirError = error;
    }

    let files: Generator<ArcFile> | undefined;
    let extractor: Extractor | undefined;
    let closed = false;
    // Index of the next header the open pass will reach, and of the one entry it should extract.
    let position = 0;
    let wanted = -1;

    function endPass(): void {
      if (!files || !extractor) {
        return;
      }
      wanted = -1;
      activate(extractor);
      try {
        while (!files.next().done) {
          /* Skip to the end, which is what closes the archive. */
        }
      } catch {
        // A failed pass has already closed the archive.
      } finally {
        files = undefined;
      }
    }

    function extractEntry(index: number, entryPath: string): Buffer {
      if (closed || !extractor) {
        throw new ArchiveFormatError(`RAR entry "${entryPath}" was opened after its archive listing ended.`);
      }
      if (!tempDir) {
        throw tempDirError;
      }
      if (!files || position > index) {
        endPass();
        position = 0;
        activate(extractor);
        files = extractor.extract({ files: () => position++ === wanted }).files;
      }
      wanted = index;
      activate(extractor);
      let done: boolean | undefined;
      try {
        done = files.next().done;
      } catch (error) {
        files = undefined;
        throw error;
      }
      if (done) {
        files = undefined;
        throw new ArchiveFormatError(`RAR entry "${entryPath}" could not be extracted.`);
      }
      return fs.readFileSync(path.join(tempDir, EXTRACTED_FILE_NAME));
    }

    try {
      let archivePath: string;
      if (isPathInput(input)) {
        archivePath = input;
      } else {
        archivePath = path.join(tempDir!, INPUT_FILE_NAME);
        await fsp.writeFile(archivePath, input);
      }

      // Every entry is staged under one fixed name, whatever the archive calls it.
      extractor = await createExtractorFromFile({
        filepath: archivePath,
        targetPath: tempDir ?? '',
        filenameTransform: () => EXTRACTED_FILE_NAME,
      });
      activate(extractor);
      const headers = [...extractor.getFileList().fileHeaders];

      for (const [index, header] of headers.entries()) {
        if (header.flags.directory) {
          continue;
        }
        yield {
          path: header.name,
          size: header.unpSize,
          openReadStream: () => Readable.from(extractEntry(index, header.name)),
        };
      }
    } finally {
      closed = true;
      endPass();
      if (tempDir) {
        await cleanupTempDir(tempDir);
      }
    }
  },

  async write() {
    throw new UnsupportedOperationError(
      'Creating RAR archives is not supported: the UnRAR source license permits decompression only, ' +
        'not building a compatible compressor. Convert to zip, tar, or asar instead.',
    );
  },
};
