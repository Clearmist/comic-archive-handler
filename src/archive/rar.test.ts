import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { rarAdapter } from './rar.js';
import { UnsupportedOperationError } from '../errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, '..', '..', 'test', 'fixtures', 'archives', 'sample.rar');
const hasFixture = fs.existsSync(fixturePath);

describe('rarAdapter', () => {
  it('refuses to write (creating RAR archives is not supported)', async () => {
    async function* noEntries() {
      /* Empty */
    }

    await expect(rarAdapter.write(noEntries(), new PassThrough())).rejects.toThrow(UnsupportedOperationError);
  });

  // RAR cannot be created with any free/open-source tool (the UnRAR source
  // license permits decompression only), so there is no way to generate a
  // fixture at test time. A maintainer with access to WinRAR (or any real
  // .rar file safe to redistribute) should add a small one at
  // test/fixtures/archives/sample.rar containing at least "a.txt" with
  // known contents to enable this test.
  describe.skipIf(!hasFixture)('listEntries (requires test/fixtures/archives/sample.rar)', () => {
    it('lists and reads entries from a real rar file', async () => {
      const entries = [];
      for await (const entry of rarAdapter.listEntries(fixturePath)) {
        entries.push(entry);
      }
      expect(entries.length).toBeGreaterThan(0);
    });
  });
});
