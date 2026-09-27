import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { ArchiveEntry, ArchiveWriteEntry } from '../archive/types.js';
import { convertEntriesConcurrently } from './convertEntriesConcurrently.js';
import { streamToBuffer } from './streamUtils.js';

function entry(path: string): ArchiveEntry {
  const content = Buffer.from(path);

  return { path, size: content.length, openReadStream: () => Readable.from(content) };
}

async function* source(paths: string[]): AsyncGenerator<ArchiveEntry> {
  for (const path of paths) {
    yield entry(path);
  }
}

const isImage = (candidate: ArchiveEntry): boolean => candidate.path.endsWith('.png');
const passThrough = (candidate: ArchiveEntry): ArchiveWriteEntry => ({
  path: candidate.path,
  size: candidate.size,
  content: candidate.openReadStream(),
});

/** Converts after a delay that shrinks with each call, so later images finish first unless order is enforced. */
function trackedConvert(delays: number[]) {
  let running = 0;
  let peak = 0;
  let call = 0;
  const convert = async (candidate: ArchiveEntry, buffer: Buffer): Promise<ArchiveWriteEntry> => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, delays[call++ % delays.length]));
    running -= 1;

    return { path: candidate.path.replace('.png', '.webp'), size: buffer.length, content: Readable.from(buffer) };
  };

  return { convert, peak: () => peak };
}

async function collect(entries: AsyncIterable<ArchiveWriteEntry>): Promise<Array<{ path: string; content: string }>> {
  const collected: Array<{ path: string; content: string }> = [];

  for await (const written of entries) {
    collected.push({ path: written.path, content: (await streamToBuffer(written.content)).toString() });
  }

  return collected;
}

describe('convertEntriesConcurrently', () => {
  it('converts one image at a time by default', async () => {
    const tracker = trackedConvert([5]);

    await collect(convertEntriesConcurrently(source(['a.png', 'b.png', 'c.png']), isImage, tracker.convert, passThrough));

    expect(tracker.peak()).toBe(1);
  });

  it('keeps entry order while converting several images at once', async () => {
    const tracker = trackedConvert([30, 20, 10, 5]);
    const paths = ['a.png', 'b.png', 'notes.txt', 'c.png', 'd.png', 'e.png', 'f.png'];
    const written = await collect(convertEntriesConcurrently(source(paths), isImage, tracker.convert, passThrough, 3));

    expect(written.map((item) => item.path)).toEqual(['a.webp', 'b.webp', 'notes.txt', 'c.webp', 'd.webp', 'e.webp', 'f.webp']);
    expect(written.map((item) => item.content)).toEqual(paths);
    expect(tracker.peak()).toBe(3);
  });

  it('skips entries the pass-through callback drops', async () => {
    const written = await collect(
      convertEntriesConcurrently(source(['a.png', 'ComicInfo.xml', 'b.png']), isImage, trackedConvert([1]).convert, (candidate) =>
        candidate.path.endsWith('.xml') ? undefined : passThrough(candidate),
      ),
    );

    expect(written.map((item) => item.path)).toEqual(['a.webp', 'b.webp']);
  });

  it('re-reads a function limit before each conversion starts', async () => {
    const tracker = trackedConvert([10]);
    let limit = 1;
    const paths = ['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png'];
    const entries = convertEntriesConcurrently(source(paths), isImage, tracker.convert, passThrough, () => limit);
    const written: string[] = [];

    for await (const item of entries) {
      written.push(item.path);
      limit = 4;
    }

    expect(written).toHaveLength(paths.length);
    expect(tracker.peak()).toBe(4);
  });

  it('treats a limit below 1 as 1', async () => {
    const tracker = trackedConvert([5]);

    await collect(convertEntriesConcurrently(source(['a.png', 'b.png']), isImage, tracker.convert, passThrough, 0));

    expect(tracker.peak()).toBe(1);
  });

  it('rethrows a failed conversion', async () => {
    const convert = async (candidate: ArchiveEntry): Promise<ArchiveWriteEntry> => {
      if (candidate.path === 'b.png') {
        throw new Error('bad image');
      }

      return passThrough(candidate);
    };

    await expect(
      collect(convertEntriesConcurrently(source(['a.png', 'b.png', 'c.png']), isImage, convert, passThrough, 3)),
    ).rejects.toThrow('bad image');
  });
});
