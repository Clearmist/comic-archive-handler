import { Transformer } from '@napi-rs/image';

const TRUNCATED = 'truncated: the file ends before its end-of-image marker';

/**
 * The JPEG decoder doesn't fail on image data it can't decode (a truncated
 * file, or corrupt entropy-coded data). It stops decoding and repeats one
 * block for the rest of the page instead, so a damaged page decodes
 * "successfully" with a band at the bottom that tiles exactly. When the file
 * uses restart markers, each block row resets to mid grey, so the band is
 * flat grey. `FILL_TILE` is a multiple of every common block size (8 pixels,
 * or 16 with chroma subsampling), so it matches the repeat at any of them.
 */
const FILL_TILE = 16;
const GREY_FILL_VALUE = 128;
/** A flat grey band needs one full block row at any subsampling; a repeated-tile band needs one verified vertical repeat. */
const MIN_GREY_FILL_ROWS = FILL_TILE;
const MIN_TILED_FILL_ROWS = FILL_TILE * 2;

/** Whether `buffer` starts with the JPEG start-of-image marker, regardless of any file extension. */
export function isJpegBuffer(buffer: Uint8Array): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function hex(marker: number): string {
  return `0x${marker.toString(16).padStart(2, '0')}`;
}

/** Validates one DHT segment's tables the way libjpeg does before decoding with them. */
function huffmanTableProblem(data: Uint8Array): string | null {
  let offset = 0;

  while (offset < data.length) {
    if (offset + 17 > data.length) {
      return 'invalid Huffman table: the table header is cut short';
    }

    const tableClass = data[offset]! >> 4;
    const tableId = data[offset]! & 0x0f;

    if (tableClass > 1 || tableId > 3) {
      return `invalid Huffman table: class ${tableClass}, id ${tableId}`;
    }

    let symbols = 0;
    let code = 0;

    for (let bits = 1; bits <= 16; bits++) {
      const count = data[offset + bits]!;

      symbols += count;
      code += count;

      // Codes of each length are assigned consecutively and must fit in that
      // many bits without using the all-ones code, which JPEG reserves.
      if (code >= 1 << bits) {
        return `invalid Huffman table: too many ${bits}-bit codes`;
      }

      code <<= 1;
    }

    if (symbols > 256) {
      return `invalid Huffman table: ${symbols} symbols (at most 256)`;
    }

    const valuesStart = offset + 17;
    const valuesEnd = valuesStart + symbols;

    if (valuesEnd > data.length) {
      return 'invalid Huffman table: the symbol list is cut short';
    }

    if (tableClass === 0 && data.subarray(valuesStart, valuesEnd).some((value) => value > 15)) {
      return 'invalid Huffman table: a DC symbol above 15';
    }

    offset = valuesEnd;
  }

  return null;
}

/** The index of the 0xff that starts the first real marker after entropy-coded data at `offset`, or the buffer's length when there is none. */
function endOfEntropyData(buffer: Uint8Array, offset: number): number {
  let index = offset;

  while (true) {
    index = buffer.indexOf(0xff, index);

    if (index === -1 || index + 1 >= buffer.length) {
      return buffer.length;
    }

    const next = buffer[index + 1]!;

    // 0xff00 is a stuffed data byte, 0xffd0-0xffd7 are restart markers, and
    // repeated 0xff bytes are fill before a marker.
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
      index += 2;
    } else if (next === 0xff) {
      index += 1;
    } else {
      return index;
    }
  }
}

/**
 * Walks a JPEG's marker segments without decoding any pixels, and describes
 * the first structural problem found: a file that ends before its
 * end-of-image marker, a segment that runs past the end of the file, or a
 * Huffman table the decoder would reject. Returns `null` for a structurally
 * sound JPEG, or for a buffer that isn't a JPEG. Stray bytes between segments
 * and data after the end-of-image marker are tolerated, as decoders do.
 */
export function findJpegStructureProblem(buffer: Uint8Array): string | null {
  if (!isJpegBuffer(buffer)) {
    return null;
  }

  let offset = 2;
  let sawScan = false;

  while (true) {
    while (offset < buffer.length && buffer[offset] !== 0xff) {
      offset++;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset++;
    }

    if (offset >= buffer.length) {
      return TRUNCATED;
    }

    const marker = buffer[offset++]!;

    if (marker === 0xd9) {
      return sawScan ? null : 'no image data before the end-of-image marker';
    }

    // Standalone markers carry no length; 0x00 is a stray stuffed byte.
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      continue;
    }

    if (offset + 2 > buffer.length) {
      return TRUNCATED;
    }

    const length = (buffer[offset]! << 8) | buffer[offset + 1]!;

    if (length < 2) {
      return `invalid length ${length} for marker ${hex(marker)}`;
    }

    const end = offset + length;

    if (end > buffer.length) {
      return TRUNCATED;
    }

    if (marker === 0xc4) {
      const problem = huffmanTableProblem(buffer.subarray(offset + 2, end));

      if (problem) {
        return problem;
      }
    }

    offset = end;

    if (marker === 0xda) {
      sawScan = true;
      offset = endOfEntropyData(buffer, offset);
    }
  }
}

/**
 * Checks a buffer's structure without decoding it (see
 * `findJpegStructureProblem`). Only JPEG is checked; other formats return
 * `null`. Cheap enough to run over every page before accepting an archive.
 */
export function findImageStructureProblem(buffer: Uint8Array): string | null {
  return findJpegStructureProblem(buffer);
}

/** How many rows at the bottom of decoded `pixels` tile exactly, repeating every `FILL_TILE` pixels across and down. */
function trailingTiledRows(pixels: Buffer, width: number, height: number): number {
  const rowLength = pixels.length / height;

  if (!Number.isInteger(rowLength) || rowLength < width || width <= FILL_TILE) {
    return 0;
  }

  const shift = FILL_TILE * (rowLength / width);
  const row = (index: number) => pixels.subarray(index * rowLength, (index + 1) * rowLength);
  let top = height;

  while (top > 0) {
    const current = row(top - 1);

    if (!current.subarray(0, rowLength - shift).equals(current.subarray(shift))) {
      break;
    }

    if (top - 1 + FILL_TILE < height && !current.equals(row(top - 1 + FILL_TILE))) {
      break;
    }

    top--;
  }

  return height - top;
}

/**
 * Fully decodes a JPEG and describes the problem when it can't be decoded, or
 * when its bottom rows are the decoder's fill for missing or corrupt image
 * data (see `FILL_TILE`), a problem the structure check can't see, such as a
 * bad Huffman code partway through the page. A band of any flat color other
 * than the fill grey isn't flagged, since it's as likely to be a page margin,
 * and neither is a page that is flat grey from top to bottom. Other formats
 * return `null` without being decoded, since their decoders fail outright on
 * damaged data. Costs a full decode, so it belongs where a page is being
 * decoded anyway, such as conversion. Returns `null` for a sound image.
 */
export async function findDecodedImageProblem(buffer: Uint8Array): Promise<string | null> {
  if (!isJpegBuffer(buffer)) {
    return null;
  }

  let width: number;
  let height: number;
  let pixels: Buffer;

  try {
    ({ width, height } = await new Transformer(buffer).metadata());
    pixels = await new Transformer(buffer).rawPixels();
  } catch (error) {
    return `could not be decoded: ${error instanceof Error ? error.message : String(error)}`;
  }

  const rows = trailingTiledRows(pixels, width, height);

  if (rows === 0 || rows === height) {
    return null;
  }

  const channels = pixels.length / height / width;
  const top = height - rows;
  const first = pixels.subarray(top * width * channels, (top * width + 1) * channels);
  let flat = true;

  // The band repeats its top-left tile, so that tile alone decides whether the band is flat.
  for (let row = top; flat && row < Math.min(top + FILL_TILE, height); row++) {
    for (let column = 0; flat && column < FILL_TILE; column++) {
      const offset = (row * width + column) * channels;

      flat = pixels.subarray(offset, offset + channels).equals(first);
    }
  }

  if (flat && first.every((value) => value === GREY_FILL_VALUE) && rows >= MIN_GREY_FILL_ROWS) {
    return `the bottom ${rows} of ${height} pixel rows are flat grey, the decoder's fill for missing or corrupt image data`;
  }

  if (!flat && rows >= MIN_TILED_FILL_ROWS) {
    return `the bottom ${rows} of ${height} pixel rows repeat a single block, the decoder's fill for missing or corrupt image data`;
  }

  return null;
}
