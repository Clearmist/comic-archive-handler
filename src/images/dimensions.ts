import { Transformer } from '@napi-rs/image';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageInfo extends ImageDimensions {
  /** The format detected from the image's contents (not its file extension), such as `jpeg`, `png`, `webp`, or `bmp`. */
  type: string;
}

/** Reads an image's format and pixel dimensions from its header without decoding it; `null` when the buffer isn't a readable image. */
export async function readImageInfo(buffer: Buffer): Promise<ImageInfo | null> {
  try {
    const { width, height, format } = await new Transformer(buffer).metadata();
    return { width, height, type: format };
  } catch {
    return null;
  }
}

/** Reads an image's pixel dimensions from its header without decoding it; `null` when the buffer isn't a readable image. */
export async function readImageDimensions(buffer: Buffer): Promise<ImageDimensions | null> {
  const info = await readImageInfo(buffer);
  return info ? { width: info.width, height: info.height } : null;
}
