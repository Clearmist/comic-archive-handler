import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveWritableTempDir, cleanupTempDir } from './tempDir.js';
import { FilesystemAccessError } from '../errors.js';

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length) {
    const dir = cleanupPaths.pop()!;

    await fs.chmod(dir, 0o755).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

describe('resolveWritableTempDir', () => {
  it('falls back to os.tmpdir() when no preferred dir is given', async () => {
    const dir = await resolveWritableTempDir();

    cleanupPaths.push(dir);

    expect(dir.startsWith(os.tmpdir())).toBe(true);

    await cleanupTempDir(dir);

    cleanupPaths.pop();
  });

  it('uses a caller-supplied writable directory', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cah-parent-'));

    cleanupPaths.push(parent);

    const dir = await resolveWritableTempDir(parent);

    expect(dir.startsWith(parent)).toBe(true);
  });

  it('throws FilesystemAccessError naming the path when the preferred dir is not writable', async () => {
    if (process.getuid && process.getuid() === 0) {
      // Root bypasses permission bits; skip in privileged environments.
      return;
    }

    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cah-readonly-'));

    cleanupPaths.push(parent);

    await fs.chmod(parent, 0o400);

    await expect(resolveWritableTempDir(parent)).rejects.toThrow(FilesystemAccessError);
    await expect(resolveWritableTempDir(parent)).rejects.toThrow(parent);
  });
});
