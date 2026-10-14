import { createHash } from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { convertArchive } from '../convertArchive.js';
import type { ArchiveType } from '../types.js';

function sampleZip(): Buffer {
  return Buffer.from(
    zipSync({
      'P00001.jpg': strToU8('page one'),
      'P00002.jpg': strToU8('page two'),
      'extras/P00003.jpg': strToU8('page three'),
      'ComicInfo.xml': strToU8('<ComicInfo />'),
    }),
  );
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// The same entries written at different times must produce the same bytes, so
// a file rewritten from the same source always ends with the same hash.
describe('archive writes are deterministic', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each<Exclude<ArchiveType, 'unknown'>>(['zip', 'tar', '7z', 'asar'])(
    'writes identical %s archives at different times',
    async (type) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const first = (await convertArchive(sampleZip(), type)) as Buffer;
      vi.setSystemTime(new Date('2026-06-15T12:34:56Z'));
      // 7z stores the staged files' own times from the filesystem, which the fake clock doesn't reach.
      await new Promise((resolve) => setTimeout(resolve, 20));
      const second = (await convertArchive(sampleZip(), type)) as Buffer;

      expect(sha256(second)).toBe(sha256(first));
    },
  );
});
