import * as path from 'node:path';
import { ArchiveFormatError } from '../errors.js';

/**
 * Resolves an archive entry path against a staging root and verifies the
 * result stays within that root, guarding against zip-slip style path
 * traversal (`../../etc/passwd`, absolute paths, etc.) before anything is
 * written to a real filesystem location.
 */
export function resolveSafeEntryPath(root: string, entryPath: string): string {
  const normalizedEntry = entryPath.replace(/\\/g, '/');
  const resolved = path.resolve(root, `.${path.sep}${normalizedEntry}`);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new ArchiveFormatError(`Refusing to write entry outside staging directory: "${entryPath}"`);
  }
  return resolved;
}
