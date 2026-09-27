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

/** An opaque image of deterministic pseudo-random pixels, so no region of it decodes to a flat color. Used by tests. */
export function noiseImage(width: number, height: number): Transformer {
  const pixels = new Uint8Array(width * height * 4);
  let seed = 0x2545f491;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      pixels[offset + channel] = seed >>> 24;
    }

    pixels[offset + 3] = 255;
  }

  return Transformer.fromRgbaPixels(pixels, width, height);
}
