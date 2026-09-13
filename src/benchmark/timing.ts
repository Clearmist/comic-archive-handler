/** Runs `run` `iterations` times and returns the average duration in milliseconds. */
export async function averageDuration(iterations: number, run: () => Promise<void>): Promise<number> {
  if (iterations <= 0) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await run();
    total += performance.now() - start;
  }
  return total / iterations;
}

/** Times `run` once per item and returns the average duration in milliseconds. */
export async function averageDurationOverItems<T>(items: T[], run: (item: T) => Promise<void>): Promise<number> {
  if (items.length === 0) {
    return 0;
  }
  let total = 0;
  for (const item of items) {
    const start = performance.now();
    await run(item);
    total += performance.now() - start;
  }
  return total / items.length;
}
