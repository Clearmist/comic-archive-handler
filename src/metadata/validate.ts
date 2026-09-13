import { readFileSync } from 'node:fs';
import { validateXML } from 'xmllint-wasm';
import type { MetadataSchema } from '../types.js';
import { schemaFilePath } from './schemaVersions.js';

export interface MetadataValidationIssue {
  message: string;
  line?: number;
}

export interface MetadataValidationResult {
  valid: boolean;
  issues: MetadataValidationIssue[];
}

const schemaCache = new Map<MetadataSchema, string>();

// libxml2 (which xmllint-wasm wraps) only implements XSD 1.0, which has no
// <xs:assert>. MetronInfo.xml v1.1 uses it for two business-rule
// constraints (at most one primary URL, at most one primary ID) that this
// validator therefore cannot check; everything else in the schema is
// enforced normally.
function loadSchema(schema: MetadataSchema): string {
  const cached = schemaCache.get(schema);
  if (cached !== undefined) {
    return cached;
  }
  const xsd = readFileSync(schemaFilePath(schema), 'utf8').replace(/<xs:assert\b[^>]*\/>\n?/g, '');
  schemaCache.set(schema, xsd);
  return xsd;
}

/**
 * Validates an XML document against the bundled ComicInfo.xml or
 * MetronInfo.xml XSD. Returns `{ valid: true, issues: [] }` when the
 * document conforms, or `{ valid: false, issues }` with one entry per
 * schema violation (element/attribute name and line number, where
 * available) otherwise.
 */
export async function validateMetadataXml(xml: string | Buffer, schema: MetadataSchema): Promise<MetadataValidationResult> {
  const result = await validateXML({
    xml: xml.toString(),
    schema: loadSchema(schema),
  });
  return {
    valid: result.valid,
    issues: result.errors.map((error) => ({
      message: error.message,
      line: error.loc?.lineNumber,
    })),
  };
}
