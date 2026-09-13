import sharp from 'sharp';
import { Readable } from 'node:stream';
import type { ArchiveInput, ImageConvertOptions, ImageOutputFormat } from '../types.js';
import { getAdapter } from '../archive/index.js';
import { detectArchiveType } from '../detect.js';
import { withOutput } from '../internal/collectOutput.js';
import { streamToBuffer } from '../internal/streamUtils.js';
import { isImagePath, getExtension } from './isImage.js';
import type { ArchiveWriteEntry } from '../archive/types.js';
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
  options: ImageConvertOptions & ArchiveWriteOptions = {},
): Promise<Buffer | void> {
  const sourceType = await detectArchiveType(input);
  const adapter = getAdapter(sourceType);
  const { tempDir, output, ...imageOptions } = options;

  async function* entries(): AsyncGenerator<ArchiveWriteEntry> {
    for await (const entry of adapter.listEntries(input, { tempDir })) {
      if (isImagePath(entry.path) && getExtension(entry.path) !== (format === 'jpg' ? 'jpg' : format)) {
        const buffer = await streamToBuffer(entry.openReadStream());
        const converted = await convertImageBuffer(buffer, format, imageOptions);

        yield { path: replaceExtension(entry.path, format), size: converted.length, content: Readable.from(converted) };
      } else {
        yield { path: entry.path, size: entry.size, content: entry.openReadStream() };
      }
    }
  }

  return withOutput(output, (destination) => adapter.write(entries(), destination, { tempDir }));
}
