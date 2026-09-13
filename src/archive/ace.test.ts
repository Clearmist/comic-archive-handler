import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { aceAdapter } from './ace.js';
import { UnsupportedOperationError } from '../errors.js';

describe('aceAdapter', () => {
  it('refuses to write (ACE is an unsupported dead format)', async () => {
    async function* noEntries() {
      /* empty */
    }
    await expect(aceAdapter.write(noEntries(), new PassThrough())).rejects.toThrow(UnsupportedOperationError);
  });

  it('refuses to read (ACE is an unsupported dead format)', async () => {
    async function drain() {
      for await (const _entry of aceAdapter.listEntries(Buffer.alloc(0))) {
        /* unreachable */
      }
    }
    await expect(drain()).rejects.toThrow(UnsupportedOperationError);
  });
});
