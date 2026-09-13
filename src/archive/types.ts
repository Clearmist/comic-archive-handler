import type { Readable, Writable } from 'node:stream';
import type { ArchiveInput, ArchiveType } from '../types.js';

export interface ArchiveEntry {
  path: string;
  size?: number;
  /** Opened lazily — only when the caller actually reads this entry. */
  openReadStream(): Readable;
}

export interface ArchiveWriteEntry {
  path: string;
  size?: number;
  content: Readable;
}

export interface ArchiveAdapterOptions {
  tempDir?: string;
}

export interface ArchiveAdapter {
  readonly type: ArchiveType;
  readonly canWrite: boolean;
  listEntries(input: ArchiveInput, options?: ArchiveAdapterOptions): AsyncIterable<ArchiveEntry>;
  write(entries: AsyncIterable<ArchiveWriteEntry>, destination: Writable, options?: ArchiveAdapterOptions): Promise<void>;
}
