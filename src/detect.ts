import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import type { ArchiveInput, ArchiveType } from './types.js';
import { isPathInput, readInputRange } from './internal/inputSource.js';
import { parseAsarHeader } from './internal/asarHeader.js';

const EXT_TO_TYPE: Record<string, ArchiveType> = {
  zip: 'zip',
  rar: 'rar',
  tar: 'tar',
  '7z': '7z',
  ace: 'ace',
};

async function detectViaFileType(input: ArchiveInput): Promise<ArchiveType | undefined> {
  const result = isPathInput(input) ? await fileTypeFromFile(input) : await fileTypeFromBuffer(input);

  if (!result) {
    return undefined;
  }

  return EXT_TO_TYPE[result.ext];
}

async function looksLikeAsar(input: ArchiveInput): Promise<boolean> {
  try {
    const header = await parseAsarHeader((start, end) => readInputRange(input, start, end));

    return Boolean(header.files);
  } catch {
    return false;
  }
}

export async function detectArchiveType(input: ArchiveInput): Promise<ArchiveType> {
  const viaMagicBytes = await detectViaFileType(input);

  if (viaMagicBytes) {
    return viaMagicBytes;
  }

  if (await looksLikeAsar(input)) {
    return 'asar';
  }

  return 'unknown';
}

export async function isZip(input: ArchiveInput): Promise<boolean> {
  return (await detectArchiveType(input)) === 'zip';
}

export async function isRar(input: ArchiveInput): Promise<boolean> {
  return (await detectArchiveType(input)) === 'rar';
}

export async function isTar(input: ArchiveInput): Promise<boolean> {
  return (await detectArchiveType(input)) === 'tar';
}

export async function isAsar(input: ArchiveInput): Promise<boolean> {
  return (await detectArchiveType(input)) === 'asar';
}

export async function is7z(input: ArchiveInput): Promise<boolean> {
  return (await detectArchiveType(input)) === '7z';
}

export async function isAce(input: ArchiveInput): Promise<boolean> {
  return (await detectArchiveType(input)) === 'ace';
}
