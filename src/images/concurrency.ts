import sharp from 'sharp';

/**
 * Sets how many libvips threads process each image, and returns the value now
 * in effect. The setting is process-wide and applies to every image operation
 * this package performs (conversion, dimensions, perceptual hashing). Callers
 * that already parallelize across images (one worker thread per core, say)
 * should pass `1` so each image doesn't also fan out across every core.
 * sharp's default is the CPU core count, except on glibc Linux without
 * jemalloc, where it is already `1`.
 */
export function setImageConcurrency(threads: number): number {
  return sharp.concurrency(threads);
}
