import sharp from 'sharp';
import type { ArchiveInput } from '../types.js';
import { getAdapter } from '../archive/index.js';
import { detectArchiveType } from '../detect.js';
import { streamToBuffer } from '../internal/streamUtils.js';
import { MetadataNotFoundError } from '../errors.js';

const HASH_SIZE = 32;
const BLOCK_SIZE = 8;

function dct1d(vector: number[]): number[] {
  const n = vector.length;
  const result = Array.from({ length: n }, () => 0);

  for (let k = 0; k < n; k++) {
    let sum = 0;

    for (let i = 0; i < n; i++) {
      sum += vector[i]! * Math.cos((Math.PI / n) * (i + 0.5) * k);
    }

    result[k] = sum;
  }

  return result;
}

function dct2d(matrix: number[][]): number[][] {
  const size = matrix.length;
  const rowsTransformed = matrix.map(dct1d);
  const result: number[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));

  for (let col = 0; col < size; col++) {
    const column = rowsTransformed.map((row) => row[col]!);
    const transformed = dct1d(column);

    for (let row = 0; row < size; row++) {
      result[row]![col] = transformed[row]!;
    }
  }

  return result;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Standard 8x8 DCT perceptual hash: resize to 32x32 greyscale, run a 2D
 * DCT-II, threshold the top-left 8x8 block against the median of that block
 * (excluding the DC term at [0][0] from the median calculation, though it is
 * still included positionally as bit 0). Returned as a bigint since JS
 * `Number` cannot losslessly represent all 64-bit patterns.
 */
export async function computeImagePHash(image: Buffer): Promise<bigint> {
  const pixels = await sharp(image).resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' }).greyscale().raw().toBuffer();

  const matrix: number[][] = [];

  for (let y = 0; y < HASH_SIZE; y++) {
    const row: number[] = [];

    for (let x = 0; x < HASH_SIZE; x++) {
      row.push(pixels[y * HASH_SIZE + x]!);
    }

    matrix.push(row);
  }

  const dct = dct2d(matrix);
  const block: number[] = [];

  for (let y = 0; y < BLOCK_SIZE; y++) {
    for (let x = 0; x < BLOCK_SIZE; x++) {
      block.push(dct[y]![x]!);
    }
  }

  const threshold = median(block.slice(1));

  let hash = 0n;

  for (const value of block) {
    hash = (hash << 1n) | (value > threshold ? 1n : 0n);
  }

  return hash;
}

export function phashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, '0');
}

export function hammingDistance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;

  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }

  return count;
}

export async function computeArchiveImagePHash(input: ArchiveInput, entryPath: string): Promise<bigint> {
  const type = await detectArchiveType(input);
  const adapter = getAdapter(type);

  for await (const entry of adapter.listEntries(input)) {
    if (entry.path === entryPath) {
      const buffer = await streamToBuffer(entry.openReadStream());

      return computeImagePHash(buffer);
    }
  }

  throw new MetadataNotFoundError(`No entry named "${entryPath}" was found in the archive.`);
}
