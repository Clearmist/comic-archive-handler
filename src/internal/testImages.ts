import { Transformer } from '@napi-rs/image';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** An opaque single-color image, ready to encode with `.png()`, `.jpeg()`, or `.webp()`. Used by tests. */
export function solidImage(width: number, height: number, { r, g, b }: Rgb): Transformer {
  const pixels = new Uint8Array(width * height * 4);

  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set([r, g, b, 255], offset);
  }

  return Transformer.fromRgbaPixels(pixels, width, height);
}
