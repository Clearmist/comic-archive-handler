import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { readArchiveEntries } from './readArchiveEntries.js';

function manualSha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('readArchiveEntries', () => {
  it('yields every entry with its bytes and sha256, in listing order', async () => {
    const zip = Buffer.from(
      zipSync({
        'a.txt': strToU8('hello'),
        'b.txt': strToU8('world'),
      }),
    );

    const results = [];
    for await (const entry of readArchiveEntries(zip)) {
      results.push(entry);
    }

    expect(results.map((entry) => entry.path)).toEqual(['a.txt', 'b.txt']);
    expect(results[0]!.buffer.toString('utf8')).toBe('hello');
    expect(results[0]!.sha256).toBe(manualSha256(Buffer.from('hello')));
    expect(results[1]!.buffer.toString('utf8')).toBe('world');
    expect(results[1]!.sha256).toBe(manualSha256(Buffer.from('world')));
  });

  it('yields nothing for an empty archive', async () => {
    const zip = Buffer.from(zipSync({}));

    const results = [];
    for await (const entry of readArchiveEntries(zip)) {
      results.push(entry);
    }

    expect(results).toEqual([]);
  });
});
