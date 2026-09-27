import { Readable } from 'node:stream';
import type { ArchiveInput, ArchiveType, ConvertArchiveOptions, MetadataSchema } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { ArchiveFormatError } from './errors.js';
import { withOutput } from './internal/collectOutput.js';
import { convertEntriesConcurrently } from './internal/convertEntriesConcurrently.js';
import { convertImageBuffer } from './images/convert.js';
import { isImagePath, getExtension } from './images/isImage.js';
import { metadataToXml } from './metadata/index.js';

const METADATA_FILE_NAMES = new Set(['ComicInfo.xml', 'MetronInfo.xml']);

function replaceExtension(entryPath: string, format: string): string {
  const withoutExt = entryPath.replace(/\.[^./\\]+$/, '');

  return `${withoutExt}.${format}`;
}

export async function convertArchive(
  input: ArchiveInput,
  targetType: Exclude<ArchiveType, 'unknown'>,
  options: ConvertArchiveOptions = {},
): Promise<Buffer | void> {
  const sourceType = await detectArchiveType(input);

  if (sourceType === 'unknown') {
    throw new ArchiveFormatError('Could not determine the source archive type.');
  }

  const sourceAdapter = getAdapter(sourceType);
  const targetAdapter = getAdapter(targetType);
  const image = options.image;
  const metadata = options.metadata;

  async function* entries(): AsyncGenerator<ArchiveWriteEntry> {
    const imageExtension = image?.format === 'jpg' ? 'jpg' : image?.format;

    yield* convertEntriesConcurrently(
      sourceAdapter.listEntries(input, { tempDir: options.tempDir }),
      (entry) => Boolean(image) && isImagePath(entry.path) && getExtension(entry.path) !== imageExtension,
      async (entry, buffer) => {
        const converted = await convertImageBuffer(buffer, image!.format, image!.options);

        return { path: replaceExtension(entry.path, imageExtension!), size: converted.length, content: Readable.from(converted) };
      },
      (entry) =>
        metadata && METADATA_FILE_NAMES.has(entry.path.split('/').pop() ?? '')
          ? undefined
          : { path: entry.path, size: entry.size, content: entry.openReadStream() },
      image?.concurrency,
    );

    if (metadata && targetType !== 'asar') {
      for (const schema of Object.keys(metadata) as MetadataSchema[]) {
        const value = metadata[schema];

        if (!value) {
          continue;
        }

        const xml = Buffer.from(metadataToXml(value, schema), 'utf8');

        yield { path: `${schema}.xml`, size: xml.length, content: Readable.from(xml) };
      }
    }
  }

  return withOutput(options.output, (destination) =>
    targetAdapter.write(entries(), destination, {
      tempDir: options.tempDir,
      ...(metadata && targetType === 'asar' ? { comicMetadata: metadata } : {}),
    }),
  );
}
