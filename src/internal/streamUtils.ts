export async function streamToBuffer(stream: AsyncIterable<Buffer | Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/** Bridges a callback-driven push source into an async iterable, in arrival order. */
export class AsyncQueue<T> {
  private readonly items: T[] = [];
  private waiter: (() => void) | null = null;
  private done = false;
  private error: unknown = null;

  push(item: T): void {
    this.items.push(item);
    this.waiter?.();
  }

  finish(): void {
    this.done = true;
    this.waiter?.();
  }

  fail(err: unknown): void {
    this.error = err;
    this.done = true;
    this.waiter?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      if (this.items.length) {
        yield this.items.shift() as T;
        continue;
      }

      if (this.error) {
        throw this.error;
      }

      if (this.done) {
        return;
      }

      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });

      this.waiter = null;
    }
  }
}
