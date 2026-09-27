import sharp from 'sharp';
import { Readable } from 'node:stream';
import type { ArchiveInput, ImageConcurrency, ImageConvertOptions, ImageOutputFormat } from '../types.js';
import { getAdapter } from '../archive/index.js';
import { detectArchiveType } from '../detect.js';
import { withOutput } from '../internal/collectOutput.js';
import { convertEntriesConcurrently } from '../internal/convertEntriesConcurrently.js';
import { isImagePath, getExtension } from './isImage.js';
import type { ArchiveWriteOptions } from '../types.js';

export async function convertImageBuffer(image: Buffer, format: ImageOutputFormat, options: ImageConvertOptions = {}): Promise<Buffer> {
  let pipeline = sharp(image);

  if (format === 'webp') {
    const webp = options.webp ?? {};

    pipeline = pipeline.webp({
      quality: webp.quality ?? 92,
      effort: webp.effort ?? 6,
      smartSubsample: webp.smartSubsample ?? true,
    });
  } else if (format === 'jpg') {
    const jpeg = options.jpeg ?? {};

    pipeline = pipeline.jpeg({ quality: jpeg.quality ?? 90 });
  } else {
    const png = options.png ?? {};

    pipeline = pipeline.png({
      quality: png.quality,
      compressionLevel: png.compressionLevel,
      palette: png.palette,
    });
  }

  return pipeline.toBuffer();
}

function replaceExtension(entryPath: string, format: ImageOutputFormat): string {
  const newExt = format === 'jpg' ? 'jpg' : format;
  const withoutExt = entryPath.replace(/\.[^./\\]+$/, '');

  return `${withoutExt}.${newExt}`;
}

export async function convertArchiveImages(
  input: ArchiveInput,
  format: ImageOutputFormat,
  options: ImageConvertOptions & ArchiveWriteOptions & { concurrency?: ImageConcurrency } = {},
): Promise<Buffer | void> {
  const sourceType = await detectArchiveType(input);
  const adapter = getAdapter(sourceType);
  const { tempDir, output, concurrency, ...imageOptions } = options;
  const entries = convertEntriesConcurrently(
    adapter.listEntries(input, { tempDir }),
    (entry) => isImagePath(entry.path) && getExtension(entry.path) !== (format === 'jpg' ? 'jpg' : format),
    async (entry, buffer) => {
      const converted = await convertImageBuffer(buffer, format, imageOptions);

      return { path: replaceExtension(entry.path, format), size: converted.length, content: Readable.from(converted) };
    },
    (entry) => ({ path: entry.path, size: entry.size, content: entry.openReadStream() }),
    concurrency,
  );

  return withOutput(output, (destination) => adapter.write(entries, destination, { tempDir }));
}
