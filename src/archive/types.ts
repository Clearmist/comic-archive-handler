import type { Readable, Writable } from 'node:stream';
import type { ArchiveInput, ArchiveType, ComicMetadata, MetadataSchema } from '../types.js';

export interface ArchiveEntry {
  path: string;
  size?: number;
  /** Opened lazily; only when the caller actually reads this entry. */
  openReadStream(): Readable;
}

export interface ArchiveWriteEntry {
  path: string;
  size?: number;
  content: Readable;
}

export interface ArchiveAdapterOptions {
  tempDir?: string;
  /**
   * Listing only: called with each folder's path (no trailing `/`), since
   * folders are never yielded as entries. An empty folder is reported only
   * when the archive records it: zip, tar, and rar store folders as entries
   * of their own, asar and 7z always know every folder.
   */
  onFolder?: (folderPath: string) => void;
  /** ASAR writes only: stored as the header's `comicMetadata` object. Ignored by every other adapter. */
  comicMetadata?: Partial<Record<MetadataSchema, ComicMetadata>>;
  /**
   * ASAR writes only: extra top-level header properties, written next to the
   * file tree (see `readAsarHeaderProperties`). `comicMetadata`, when also
   * given, replaces a `comicMetadata` property here. Ignored by every other adapter.
   */
  headerProperties?: Record<string, unknown>;
}

export interface ArchiveAdapter {
  readonly type: ArchiveType;
  readonly canWrite: boolean;
  listEntries(input: ArchiveInput, options?: ArchiveAdapterOptions): AsyncIterable<ArchiveEntry>;
  write(entries: AsyncIterable<ArchiveWriteEntry>, destination: Writable, options?: ArchiveAdapterOptions): Promise<void>;
}
