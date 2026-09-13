import { Readable } from 'node:stream';
import type { ArchiveInput, ArchiveType, ConvertArchiveOptions } from './types.js';
import type { ArchiveWriteEntry } from './archive/types.js';
import { getAdapter } from './archive/index.js';
import { detectArchiveType } from './detect.js';
import { ArchiveFormatError } from './errors.js';
import { withOutput } from './internal/collectOutput.js';
import { streamToBuffer } from './internal/streamUtils.js';
import { convertImageBuffer } from './images/convert.js';
import { isImagePath, getExtension } from './images/isImage.js';

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

  async function* entries(): AsyncGenerator<ArchiveWriteEntry> {
    for await (const entry of sourceAdapter.listEntries(input, { tempDir: options.tempDir })) {
      if (image && isImagePath(entry.path) && getExtension(entry.path) !== (image.format === 'jpg' ? 'jpg' : image.format)) {
        const buffer = await streamToBuffer(entry.openReadStream());
        const converted = await convertImageBuffer(buffer, image.format, image.options);

        yield {
          path: replaceExtension(entry.path, image.format === 'jpg' ? 'jpg' : image.format),
          size: converted.length,
          content: Readable.from(converted),
        };
      } else {
        yield { path: entry.path, size: entry.size, content: entry.openReadStream() };
      }
    }
  }

  return withOutput(options.output, (destination) => targetAdapter.write(entries(), destination, { tempDir: options.tempDir }));
}
