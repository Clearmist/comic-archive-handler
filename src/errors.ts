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
