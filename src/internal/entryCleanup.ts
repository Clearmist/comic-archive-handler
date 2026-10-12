import { IMAGE_EXTENSIONS } from '../images/isImage.js';
import { naturalCompare } from './naturalSort.js';

/** The lowercase extensions an archive keeps when stripped: every image extension and `xml`, plus `extraKeepExtensions`. */
export function essentialExtensions(extraKeepExtensions: string[] = []): Set<string> {
  return new Set<string>([...IMAGE_EXTENSIONS, 'xml', ...extraKeepExtensions].map((ext) => ext.toLowerCase()));
}

/**
 * Maps each image path to its standard `P#####` name, without an extension,
 * numbered from `start` in natural sort order of the paths.
 */
export function sequentialImageStems(imagePaths: string[], options: { start?: number; pad?: number } = {}): Map<string, string> {
  const pad = options.pad ?? 5;
  const start = options.start ?? 1;
  const stems = new Map<string, string>();

  [...imagePaths].sort(naturalCompare).forEach((entryPath, index) => {
    stems.set(entryPath, `P${String(start + index).padStart(pad, '0')}`);
  });

  return stems;
}
