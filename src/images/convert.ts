import { ChromaSubsampling, CompressionType, Transformer, pngQuantize } from '@napi-rs/image';
import { Readable } from 'node:stream';
import type { ArchiveInput, AvifOptions, ImageConcurrency, ImageConvertOptions, ImageOutputFormat } from '../types.js';
import { getAdapter } from '../archive/index.js';
import { detectArchiveType } from '../detect.js';
import { CorruptImageError } from '../errors.js';
import { withOutput } from '../internal/collectOutput.js';
import { withEntryPath } from '../internal/withEntryPath.js';
import { convertEntriesConcurrently } from '../internal/convertEntriesConcurrently.js';
import { isImagePath, getExtension } from './isImage.js';
import { findDecodedImageProblem, findImageStructureProblem } from './integrity.js';
import type { ArchiveWriteOptions } from '../types.js';

const CHROMA_SUBSAMPLING: Record<NonNullable<AvifOptions['chromaSubsampling']>, ChromaSubsampling> = {
  '4:4:4': ChromaSubsampling.Yuv444,
  '4:2:2': ChromaSubsampling.Yuv422,
  '4:2:0': ChromaSubsampling.Yuv420,
  '4:0:0': ChromaSubsampling.Yuv400,
};

function pngCompressionType(level: number): CompressionType {
  return level <= 3 ? CompressionType.Fast : level >= 7 ? CompressionType.Best : CompressionType.Default;
}

/**
 * Re-encodes `image` as `format`. Throws `CorruptImageError` rather than
 * producing a damaged page when the source is corrupt: a JPEG that is
 * truncated or has bad Huffman tables, or that decodes with a flat grey band
 * where its image data is missing or corrupt (see `findDecodedImageProblem`).
 */
export async function convertImageBuffer(image: Buffer, format: ImageOutputFormat, options: ImageConvertOptions = {}): Promise<Buffer> {
  const problem = findImageStructureProblem(image) ?? (await findDecodedImageProblem(image));

  if (problem) {
    throw new CorruptImageError(problem);
  }

  const transformer = new Transformer(image);

  if (format === 'webp') {
    return transformer.webp(options.webp?.quality ?? 92);
  }

  if (format === 'avif') {
    const avif = options.avif ?? {};

    return transformer.avif({
      quality: avif.quality ?? 90,
      alphaQuality: avif.alphaQuality,
      speed: avif.speed ?? 4,
      chromaSubsampling: CHROMA_SUBSAMPLING[avif.chromaSubsampling ?? '4:4:4'],
      threads: avif.threads,
    });
  }

  if (format === 'jpg') {
    return transformer.jpeg(options.jpeg?.quality ?? 90);
  }

  const png = options.png ?? {};
  const encoded = await transformer.png({ compressionType: pngCompressionType(png.compressionLevel ?? 8) });

  return png.palette ? pngQuantize(encoded, { minQuality: 0, maxQuality: png.quality ?? 100 }) : encoded;
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
      const converted = await convertImageBuffer(buffer, format, imageOptions).catch((error: unknown) => {
        throw withEntryPath(error, entry.path);
      });

      return { path: replaceExtension(entry.path, format), size: converted.length, content: Readable.from(converted) };
    },
    (entry) => ({ path: entry.path, size: entry.size, content: entry.openReadStream() }),
    concurrency,
  );

  return withOutput(output, (destination) => adapter.write(entries, destination, { tempDir }));
}
