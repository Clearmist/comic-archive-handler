import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FilesystemAccessError } from '../errors.js';

async function isWritableDir(dir: string): Promise<boolean> {
  const probe = path.join(dir, `.cah-write-probe-${process.pid}-${Date.now()}`);
  try {
    await fs.writeFile(probe, '');
    await fs.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a writable staging directory for operations that require real
 * filesystem access (asar writes, any 7z operation).
 *
 * - If `preferredDir` is given, it must already exist and be writable, or a
 *   FilesystemAccessError is thrown naming the path (no silent fallback).
 * - Otherwise, attempts `fs.mkdtemp()` under `os.tmpdir()`.
 * - If that also fails (no writable tmp available, e.g. a locked-down
 *   sandbox), throws FilesystemAccessError telling the caller to pass
 *   `{ tempDir }` explicitly.
 *
 * Returns a freshly created subdirectory the caller owns and is responsible
 * for cleaning up.
 */
export async function resolveWritableTempDir(preferredDir?: string): Promise<string> {
  if (preferredDir) {
    if (!(await isWritableDir(preferredDir))) {
      throw new FilesystemAccessError(`The provided tempDir "${preferredDir}" is not writable. Pass a writable directory via { tempDir }.`);
    }
    return fs.mkdtemp(path.join(preferredDir, 'cah-'));
  }

  try {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'cah-'));
  } catch (err) {
    throw new FilesystemAccessError(
      `No writable temporary directory is available (${(err as Error).message}). ` +
        'Supply one explicitly via { tempDir: "<writable path>" }.',
    );
  }
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
