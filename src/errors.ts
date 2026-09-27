export class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedOperationError';
  }
}

export class ArchiveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveFormatError';
  }
}

export class MetadataNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataNotFoundError';
  }
}

export class FilesystemAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilesystemAccessError';
  }
}

export class SevenZipUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SevenZipUnavailableError';
  }
}

export class NoImagesFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoImagesFoundError';
  }
}

export class CorruptImageError extends Error {
  /** Why the image can't be trusted to convert cleanly. */
  readonly reason: string;
  /** The image's path inside its archive, when it came from one. */
  readonly entryPath?: string;

  constructor(reason: string, entryPath?: string) {
    super(entryPath ? `${entryPath}: ${reason}` : reason);
    this.name = 'CorruptImageError';
    this.reason = reason;
    this.entryPath = entryPath;
  }
}
