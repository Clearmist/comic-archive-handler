import type { ArchiveAdapter } from './types.js';
import { UnsupportedOperationError } from '../errors.js';

const ACE_UNSUPPORTED_MESSAGE =
  "ACE (CBA) archives are not supported: ACE is a dead format that hasn't been updated since 2011 " +
  'and has multiple known security vulnerabilities.';

export const aceAdapter: ArchiveAdapter = {
  type: 'ace',
  canWrite: false,

  listEntries() {
    throw new UnsupportedOperationError(ACE_UNSUPPORTED_MESSAGE);
  },

  async write() {
    throw new UnsupportedOperationError(ACE_UNSUPPORTED_MESSAGE);
  },
};
