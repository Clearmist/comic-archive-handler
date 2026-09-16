import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { MetadataSchema } from '../types.js';

/**
 * Update these when the XSDs in `schemas/` are replaced with a newer
 * release. Every place that needs to read a bundled schema file (tests,
 * dev tooling, runtime validation) derives its filename from here instead
 * of hardcoding a version number.
 */
export const SCHEMA_VERSIONS: Record<MetadataSchema, string> = {
  ComicInfo: '2.1',
  MetronInfo: '1.1',
};

/**
 * Walks up from this module's location to find the package root (the
 * directory containing `schemas/`). This module runs both from `src/`
 * (tests, ts-node) and from the single-file bundle in `dist/`; those sit
 * at different depths relative to the package root, so the depth can't be
 * hardcoded.
 */
function findPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));

  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'schemas'))) {
      return dir;
    }

    dir = join(dir, '..');
  }

  throw new Error('Could not locate the "schemas" directory relative to the package root.');
}

/** Absolute path to the bundled XSD for `schema`, e.g. ".../schemas/ComicInfo v2.1.xsd". */
export function schemaFilePath(schema: MetadataSchema): string {
  return join(findPackageRoot(), 'schemas', `${schema} v${SCHEMA_VERSIONS[schema]}.xsd`);
}
