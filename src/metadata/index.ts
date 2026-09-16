import { Readable } from 'node:stream';
import type { ArchiveInput, ArchiveWriteOptions, ComicMetadata, MetadataSchema, AddMetadataOptions } from '../types.js';
import { getAdapter } from '../archive/index.js';
import type { ArchiveWriteEntry } from '../archive/types.js';
import { detectArchiveType } from '../detect.js';
import { ArchiveFormatError } from '../errors.js';
import { withOutput } from '../internal/collectOutput.js';
import { parseAsarHeader, writeAsarHeaderPatch } from '../internal/asarHeader.js';
import { readInputRange } from '../internal/inputSource.js';
import { removeArchiveEntry } from '../removeArchiveEntry.js';
import { streamToBuffer } from '../internal/streamUtils.js';
import { metadataToComicInfoXml, comicInfoXmlToMetadata } from './comicInfo.js';
import { metadataToMetronInfoXml, metronInfoXmlToMetadata } from './metronInfo.js';

export { metadataToComicInfoXml, comicInfoXmlToMetadata } from './comicInfo.js';
export { metadataToMetronInfoXml, metronInfoXmlToMetadata } from './metronInfo.js';
export { validateMetadataXml } from './validate.js';
export type { MetadataValidationResult, MetadataValidationIssue } from './validate.js';
export {
  COMIC_INFO_CREDIT_ROLES,
  COMIC_INFO_YES_NO_VALUES,
  COMIC_INFO_MANGA_VALUES,
  COMIC_INFO_AGE_RATING_VALUES,
  COMIC_INFO_PAGE_TYPE_VALUES,
  METRON_FORMAT_VALUES,
  METRON_INFORMATION_SOURCE_VALUES,
  METRON_ROLE_VALUES,
  METRON_AGE_RATING_VALUES,
  splitCommaList,
  joinCommaList,
  resourceName,
  resourceId,
  joinResourceNames,
} from './schema.js';
export type { ComicInfoCreditRole } from './schema.js';

const FILE_NAMES: Record<MetadataSchema, string> = {
  ComicInfo: 'ComicInfo.xml',
  MetronInfo: 'MetronInfo.xml',
};

export function metadataToXml(metadata: ComicMetadata, schema: MetadataSchema): string {
  return schema === 'ComicInfo' ? metadataToComicInfoXml(metadata) : metadataToMetronInfoXml(metadata);
}

export function xmlToMetadata(xml: string | Buffer, schema: MetadataSchema): ComicMetadata {
  return schema === 'ComicInfo' ? comicInfoXmlToMetadata(xml) : metronInfoXmlToMetadata(xml);
}

/** The archive's header `comicMetadata` object, if it's an asar archive with one; `{}` otherwise. */
async function readAsarComicMetadataHeader(input: ArchiveInput): Promise<{ ComicInfo?: ComicMetadata; MetronInfo?: ComicMetadata }> {
  const { header } = await parseAsarHeader((start, end) => readInputRange(input, start, end));
  const comicMetadata = (header as { comicMetadata?: { ComicInfo?: ComicMetadata; MetronInfo?: ComicMetadata } }).comicMetadata;

  return comicMetadata ?? {};
}

export async function hasComicMetadata(
  input: ArchiveInput,
): Promise<{ present: boolean; schema?: MetadataSchema; path?: string; bothPresent?: boolean }> {
  const type = await detectArchiveType(input);

  if (type === 'asar') {
    const comicMetadata = await readAsarComicMetadataHeader(input);
    const bothPresent = Boolean(comicMetadata.ComicInfo && comicMetadata.MetronInfo);

    if (comicMetadata.ComicInfo) {
      return { present: true, schema: 'ComicInfo', bothPresent };
    }

    if (comicMetadata.MetronInfo) {
      return { present: true, schema: 'MetronInfo', bothPresent };
    }

    return { present: false, bothPresent: false };
  }

  const adapter = getAdapter(type);

  for await (const entry of adapter.listEntries(input)) {
    const base = entry.path.split('/').pop();

    if (base === 'ComicInfo.xml') {
      return { present: true, schema: 'ComicInfo', path: entry.path };
    }

    if (base === 'MetronInfo.xml') {
      return { present: true, schema: 'MetronInfo', path: entry.path };
    }
  }

  return { present: false };
}

/**
 * Reads embedded comic metadata. With no `schema`, returns whichever schema
 * `hasComicMetadata` finds first (asar prefers ComicInfo when both are
 * present). Pass `schema` to read that specific one regardless of which is
 * preferred. The only way to read a non-preferred schema back out of an
 * asar archive that has both, since its metadata isn't addressable by path.
 */
export async function readArchiveMetadata(
  input: ArchiveInput,
  schema?: MetadataSchema,
): Promise<{ schema: MetadataSchema; metadata: ComicMetadata } | null> {
  const type = await detectArchiveType(input);

  if (type === 'asar') {
    const comicMetadata = await readAsarComicMetadataHeader(input);
    const resolvedSchema = schema ?? (comicMetadata.ComicInfo ? 'ComicInfo' : comicMetadata.MetronInfo ? 'MetronInfo' : undefined);
    const metadata = resolvedSchema && comicMetadata[resolvedSchema];

    return resolvedSchema && metadata ? { schema: resolvedSchema, metadata } : null;
  }

  const adapter = getAdapter(type);

  if (schema) {
    const fileName = FILE_NAMES[schema];

    for await (const entry of adapter.listEntries(input)) {
      if (entry.path.split('/').pop() === fileName) {
        const buffer = await streamToBuffer(entry.openReadStream());

        return { schema, metadata: xmlToMetadata(buffer, schema) };
      }
    }

    return null;
  }

  const found = await hasComicMetadata(input);

  if (!found.present || !found.schema || !found.path) {
    return null;
  }

  for await (const entry of adapter.listEntries(input)) {
    if (entry.path === found.path) {
      const buffer = await streamToBuffer(entry.openReadStream());

      return { schema: found.schema, metadata: xmlToMetadata(buffer, found.schema) };
    }
  }

  return null;
}

export async function addMetadataToArchive(
  input: ArchiveInput,
  metadata: ComicMetadata,
  schema: MetadataSchema,
  options: AddMetadataOptions = {},
): Promise<Buffer | void> {
  const type = await detectArchiveType(input);

  if (type === 'asar') {
    return writeAsarHeaderPatch(
      input,
      (header) => {
        const record = header as { comicMetadata?: Record<string, unknown> };

        record.comicMetadata ??= {};

        if (!options.overwrite && record.comicMetadata[schema]) {
          throw new ArchiveFormatError(`Archive already contains ${schema} metadata; pass { overwrite: true } to replace it.`);
        }

        record.comicMetadata[schema] = metadata;
      },
      options,
    );
  }

  const adapter = getAdapter(type);
  const fileName = FILE_NAMES[schema];
  const xmlBuffer = Buffer.from(metadataToXml(metadata, schema), 'utf8');

  async function* entries(): AsyncGenerator<ArchiveWriteEntry> {
    let replaced = false;

    for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
      const base = entry.path.split('/').pop();

      if (base === fileName) {
        if (!options.overwrite) {
          throw new ArchiveFormatError(`Archive already contains ${fileName}; pass { overwrite: true } to replace it.`);
        }

        replaced = true;

        yield { path: entry.path, size: xmlBuffer.length, content: Readable.from(xmlBuffer) };

        continue;
      }

      yield { path: entry.path, size: entry.size, content: entry.openReadStream() };
    }

    if (!replaced) {
      yield { path: fileName, size: xmlBuffer.length, content: Readable.from(xmlBuffer) };
    }
  }

  return withOutput(options.output, (destination) => adapter.write(entries(), destination, { tempDir: options.tempDir }));
}

/**
 * Removes the embedded `{schema}` metadata, if present; an asar header key
 * removal; or the matching `{schema}.xml` entry for every other format.
 * Throws `ArchiveFormatError` if the archive has no such metadata; a caller
 * that wants a no-op instead should check `hasComicMetadata` first.
 */
export async function removeComicMetadata(
  input: ArchiveInput,
  schema: MetadataSchema,
  options: ArchiveWriteOptions = {},
): Promise<Buffer | void> {
  const type = await detectArchiveType(input);

  if (type === 'asar') {
    return writeAsarHeaderPatch(
      input,
      (header) => {
        const comicMetadata = header.comicMetadata as Record<string, unknown> | undefined;

        if (!comicMetadata?.[schema]) {
          throw new ArchiveFormatError(`Archive does not contain ${schema} metadata.`);
        }

        delete comicMetadata[schema];
      },
      options,
    );
  }

  const adapter = getAdapter(type);
  const fileName = FILE_NAMES[schema];

  for await (const entry of adapter.listEntries(input, { tempDir: options.tempDir })) {
    if (entry.path.split('/').pop() === fileName) {
      return removeArchiveEntry(input, entry.path, options);
    }
  }

  throw new ArchiveFormatError(`Archive does not contain ${fileName}.`);
}
