import type { ArchiveType } from '../types.js';
import { ArchiveFormatError } from '../errors.js';
import type { ArchiveAdapter } from './types.js';
import { zipAdapter } from './zip.js';
import { tarAdapter } from './tar.js';
import { rarAdapter } from './rar.js';
import { asarAdapter } from './asar.js';
import { sevenZipAdapter } from './sevenZip.js';
import { aceAdapter } from './ace.js';

const adapters: Partial<Record<ArchiveType, ArchiveAdapter>> = {
  zip: zipAdapter,
  tar: tarAdapter,
  rar: rarAdapter,
  asar: asarAdapter,
  '7z': sevenZipAdapter,
  ace: aceAdapter,
};

export function getAdapter(type: ArchiveType): ArchiveAdapter {
  const adapter = adapters[type];
  if (!adapter) {
    throw new ArchiveFormatError(`No archive adapter is available for type "${type}".`);
  }
  return adapter;
}

export type { ArchiveAdapter, ArchiveEntry, ArchiveWriteEntry, ArchiveAdapterOptions } from './types.js';
