import { Readable } from 'node:stream';
import type { ArchiveInput, ComicMetadata, MetadataSchema, AddMetadataOptions } from '../types.js';
import { getAdapter } from '../archive/index.js';
import type { ArchiveWriteEntry } from '../archive/types.js';
import { detectArchiveType } from '../detect.js';
import { ArchiveFormatError } from '../errors.js';
import { withOutput } from '../internal/collectOutput.js';
import { hasRootFile, parseAsarHeader } from '../internal/asarHeader.js';
import { readInputRange } from '../internal/inputSource.js';
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

export async function hasComicMetadata(input: ArchiveInput): Promise<{ present: boolean; schema?: MetadataSchema; path?: string }> {
  const type = await detectArchiveType(input);

  if (type === 'asar') {
    const { header } = await parseAsarHeader((start, end) => readInputRange(input, start, end));
    if (hasRootFile(header, 'ComicInfo.xml')) {
      return { present: true, schema: 'ComicInfo', path: 'ComicInfo.xml' };
    }
    if (hasRootFile(header, 'MetronInfo.xml')) {
      return { present: true, schema: 'MetronInfo', path: 'MetronInfo.xml' };
    }
    return { present: false };
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

export async function readArchiveMetadata(input: ArchiveInput): Promise<{ schema: MetadataSchema; metadata: ComicMetadata } | null> {
  const found = await hasComicMetadata(input);
  if (!found.present || !found.schema || !found.path) {
    return null;
  }

  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);
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
