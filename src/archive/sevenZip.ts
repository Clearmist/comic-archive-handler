import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import sevenBin from '7zip-bin-full';
import type { ArchiveAdapter } from './types.js';
import { ArchiveFormatError, SevenZipUnavailableError } from '../errors.js';
import { inputToBuffer } from '../internal/inputSource.js';
import { resolveWritableTempDir, cleanupTempDir } from '../internal/tempDir.js';
import { resolveSafeEntryPath } from '../internal/safePath.js';

async function ensureBinaryAvailable(): Promise<string> {
  const binPath = sevenBin.path7zzs;
  if (!fs.existsSync(binPath)) {
    throw new SevenZipUnavailableError(
      `No 7-Zip binary is available for this platform/architecture (expected at "${binPath}"). ` +
        '7z read/write is unavailable here; 7z detection via magic bytes still works.',
    );
  }
  try {
    await fsp.access(binPath, fs.constants.X_OK);
  } catch {
    // NPM's tarball extraction doesn't always preserve the executable bit
    // (observed cross-platform/sandbox quirk); self-heal rather than fail.
    try {
      await fsp.chmod(binPath, 0o755);
      await fsp.access(binPath, fs.constants.X_OK);
    } catch {
      throw new SevenZipUnavailableError(`The bundled 7-Zip binary at "${binPath}" is not executable and could not be made executable.`);
    }
  }
  return binPath;
}

/**
 * Spawns the bundled 7zzs (standalone 7-Zip) binary directly rather than
 * going through the `node-7z` wrapper: that package has no way to set the
 * child process's working directory, which is required here to get archive
 * entries stored with paths relative to the staging directory (rather than
 * either leaking absolute host paths or, as discovered during
 * implementation testing, silently operating against this process's actual
 * cwd instead of the intended staging directory).
 */
function run7z(binPath: string, args: string[], options: { cwd: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { cwd: options.cwd, windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new ArchiveFormatError(`7zzs exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function* walkFiles(root: string, prefix = ''): AsyncGenerator<{ absPath: string; relPath: string }> {
  const dirents = await fsp.readdir(path.join(root, prefix), { withFileTypes: true });
  for (const dirent of dirents) {
    const relPath = prefix ? `${prefix}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      yield* walkFiles(root, relPath);
    } else if (dirent.isFile()) {
      yield { absPath: path.join(root, relPath), relPath };
    }
  }
}

/**
 * Both directions round-trip through a staging directory: the 7z CLI
 * operates on real files, not stdin/stdout, for multi-file archives. Entries
 * are still streamed to/from disk one at a time rather than collected into
 * memory first.
 */
export const sevenZipAdapter: ArchiveAdapter = {
  type: '7z',
  canWrite: true,

  async *listEntries(input, options) {
    const binPath = await ensureBinaryAvailable();
    const tempDir = await resolveWritableTempDir(options?.tempDir);
    try {
      const archivePath = path.join(tempDir, 'input.7z');
      await fsp.writeFile(archivePath, await inputToBuffer(input));

      const extractDir = path.join(tempDir, 'extracted');
      await fsp.mkdir(extractDir, { recursive: true });
      await run7z(binPath, ['x', archivePath, `-o${extractDir}`, '-y'], { cwd: tempDir });

      for await (const { absPath, relPath } of walkFiles(extractDir)) {
        const stat = await fsp.stat(absPath);
        yield {
          path: relPath,
          size: stat.size,
          openReadStream: () => fs.createReadStream(absPath),
        };
      }
    } finally {
      await cleanupTempDir(tempDir);
    }
  },

  async write(entries, destination, options) {
    const binPath = await ensureBinaryAvailable();
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

      const outputFile = path.join(tempDir, 'output.7z');
      await run7z(binPath, ['a', '-y', outputFile, '*', '-r'], { cwd: stagingDir });

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
