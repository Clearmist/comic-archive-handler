import * as fs from 'node:fs';
import { PassThrough, type Writable } from 'node:stream';
import { streamToBuffer } from './streamUtils.js';

/**
 * Runs `run` against a destination stream. When `output` is given (a path or
 * a Writable), the result streams directly there and this resolves to
 * `undefined`. Otherwise the result is collected into a Buffer for
 * convenience.
 */
export async function withOutput(
  output: string | Writable | undefined,
  run: (destination: Writable) => Promise<void>,
): Promise<Buffer | void> {
  if (typeof output === 'string') {
    const dest = fs.createWriteStream(output);
    await run(dest);
    return;
  }
  if (output) {
    await run(output);
    return;
  }
  const pass = new PassThrough();
  const bufferPromise = streamToBuffer(pass);
  await run(pass);
  return bufferPromise;
}
