import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ArchiveInput, ArchiveType, ConvertArchiveOptions, ConvertedArchiveEntry, MetadataSchema } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { ArchiveFormatError } from './errors.js';
import { carriedHeaderProperties } from './internal/asarHeader.js';
import { withOutput } from './internal/collectOutput.js';
import { convertEntriesConcurrently } from './internal/convertEntriesConcurrently.js';
import { essentialExtensions, sequentialImageStems } from './internal/entryCleanup.js';
import { withEntryPath } from './internal/withEntryPath.js';
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
  const onEntry = options.onEntry;
  const keepExtensions = options.strip
    ? essentialExtensions(options.strip === true ? undefined : options.strip.extraKeepExtensions)
    : undefined;
  let stems: Map<string, string> | undefined;

  // Renaming needs every image name before the first entry is written, hence a listing pass of its own (no content is read).
  if (options.renameImages) {
    const imagePaths: string[] = [];

    for await (const entry of sourceAdapter.listEntries(input, { tempDir: options.tempDir })) {
      if (isImagePath(entry.path)) {
        imagePaths.push(entry.path);
      }
    }

    stems = sequentialImageStems(imagePaths, options.renameImages === true ? {} : options.renameImages);
  }

  // What `onEntry` is told about each entry, kept until the entry is handed to the writer.
  const reports = new WeakMap<ArchiveWriteEntry, ConvertedArchiveEntry>();

  function reported(written: ArchiveWriteEntry, report: () => Omit<ConvertedArchiveEntry, 'path'>): ArchiveWriteEntry {
    if (onEntry) {
      reports.set(written, { path: written.path, ...report() });
    }

    return written;
  }

  async function* entries(): AsyncGenerator<ArchiveWriteEntry> {
    const imageExtension = image?.format === 'jpg' ? 'jpg' : image?.format;
    const converted = convertEntriesConcurrently(
      sourceAdapter.listEntries(input, { tempDir: options.tempDir }),
      (entry) => Boolean(image) && isImagePath(entry.path) && getExtension(entry.path) !== imageExtension,
      async (entry, buffer) => {
        const encoded = await convertImageBuffer(buffer, image!.format, image!.options).catch((error: unknown) => {
          throw withEntryPath(error, entry.path);
        });
        const stem = stems?.get(entry.path);

        return reported(
          {
            path: stem ? `${stem}.${imageExtension!}` : replaceExtension(entry.path, imageExtension!),
            size: encoded.length,
            content: Readable.from(encoded),
          },
          () => ({
            sourcePath: entry.path,
            reencoded: { size: encoded.length, sha256: createHash('sha256').update(encoded).digest('hex') },
          }),
        );
      },
      (entry) => {
        if (metadata && METADATA_FILE_NAMES.has(entry.path.split('/').pop() ?? '')) {
          return undefined;
        }

        if (keepExtensions && !keepExtensions.has(getExtension(entry.path))) {
          return undefined;
        }

        const stem = stems?.get(entry.path);

        return reported(
          { path: stem ? `${stem}.${getExtension(entry.path)}` : entry.path, size: entry.size, content: entry.openReadStream() },
          () => ({ sourcePath: entry.path }),
        );
      },
      image?.concurrency,
    );

    for await (const written of converted) {
      const report = reports.get(written);

      if (report) {
        onEntry?.(report);
      }

      yield written;
    }

    if (metadata && targetType !== 'asar') {
      for (const schema of Object.keys(metadata) as MetadataSchema[]) {
        const value = metadata[schema];

        if (!value) {
          continue;
        }

        const xml = Buffer.from(metadataToXml(value, schema), 'utf8');

        onEntry?.({ path: `${schema}.xml` });

        yield { path: `${schema}.xml`, size: xml.length, content: Readable.from(xml) };
      }
    }
  }

  // An asar to asar conversion keeps every header property; `metadata`, when given, still replaces `comicMetadata`.
  const carried = targetType === 'asar' ? await carriedHeaderProperties(input, sourceType) : {};

  return withOutput(options.output, (destination) =>
    targetAdapter.write(entries(), destination, {
      tempDir: options.tempDir,
      ...carried,
      ...(metadata && targetType === 'asar' ? { comicMetadata: metadata } : {}),
    }),
  );
}
