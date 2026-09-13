import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { ArchiveInput } from '../types.js';

export function isPathInput(input: ArchiveInput): input is string {
  return typeof input === 'string';
}

export async function inputToBuffer(input: ArchiveInput): Promise<Buffer> {
  return isPathInput(input) ? fsp.readFile(input) : input;
}

export async function inputSize(input: ArchiveInput): Promise<number> {
  if (isPathInput(input)) {
    const stat = await fsp.stat(input);
    return stat.size;
  }
  return input.length;
}

/** Reads the half-open byte range [start, end) from a Buffer or file path. */
export async function readInputRange(input: ArchiveInput, start: number, end: number): Promise<Buffer> {
  if (!isPathInput(input)) {
    return Buffer.from(input.subarray(start, end));
  }
  const fd = await fsp.open(input, 'r');
  try {
    const length = Math.max(0, end - start);
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fd.read(buf, 0, length, start);
    return buf.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
}

export function openInputReadStream(input: ArchiveInput, range?: { start: number; end: number }): Readable {
  if (isPathInput(input)) {
    return fs.createReadStream(input, range ? { start: range.start, end: range.end - 1 } : undefined);
  }
  const slice = range ? input.subarray(range.start, range.end) : input;
  return Readable.from(slice);
}
