import sharp from 'sharp';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageInfo extends ImageDimensions {
  /** The format detected from the image's contents (not its file extension), such as `jpeg`, `png`, `webp`, or `bmp`. */
  type: string;
}

const BMP_HEADER_SIZE = 26;

/** `sharp` can't read BMP, so read a BMP's dimensions straight from its `BITMAPINFOHEADER`. Height is negative for top-down bitmaps. */
function readBmpInfo(buffer: Buffer): ImageInfo | null {
  if (buffer.length < BMP_HEADER_SIZE || buffer.toString('latin1', 0, 2) !== 'BM') {
    return null;
  }

  const width = buffer.readInt32LE(18);
  const height = Math.abs(buffer.readInt32LE(22));

  return width > 0 && height > 0 ? { width, height, type: 'bmp' } : null;
}

/** Reads an image's format and pixel dimensions from its header without decoding it; `null` when the buffer isn't a readable image. */
export async function readImageInfo(buffer: Buffer): Promise<ImageInfo | null> {
  try {
    const { width, height, format } = await sharp(buffer).metadata();
    return width !== undefined && height !== undefined ? { width, height, type: format } : null;
  } catch {
    return readBmpInfo(buffer);
  }
}

/** Reads an image's pixel dimensions from its header without decoding it; `null` when the buffer isn't a readable image. */
export async function readImageDimensions(buffer: Buffer): Promise<ImageDimensions | null> {
  const info = await readImageInfo(buffer);
  return info ? { width: info.width, height: info.height } : null;
}
