# API Reference

Package: `@clearmist-labs/comic-archive-handler`

The package is ESM-only and requires Node.js 18 or newer. Archive inputs are either a filesystem path or a `Buffer`. Functions that produce archives return a `Buffer` by default. Pass an `output` path or writable stream to stream the result and receive `void` instead.

Most runtime functions are available as named exports and as properties of the default export. Type-only exports are available to TypeScript consumers but are not runtime properties of the default export.

## Archive detection

### `detectArchiveType(input)`

Detects an archive from its magic bytes and returns `'zip'`, `'rar'`, `'tar'`, `'asar'`, `'7z'`, `'ace'`, or `'unknown'`.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.

**Example**

```js
import { detectArchiveType } from '@clearmist-labs/comic-archive-handler';

const type = await detectArchiveType('/books/example.cbz');
console.log(type); // 'zip'
```

### `isZip(input)`, `isRar(input)`, `isTar(input)`, `isAsar(input)`, `is7z(input)`, `isAce(input)`

Convenience predicates that detect an archive and return whether it matches the named format. `isAce` detects ACE (`.cba`) archives, but every actual ACE operation (read, write, or conversion) throws `UnsupportedOperationError` — see [`UnsupportedOperationError`](#unsupportedoperationerror).

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.

**Example**

```js
import { isZip } from '@clearmist-labs/comic-archive-handler';

if (await isZip(comicBuffer)) {
  console.log('This is a CBZ-style ZIP archive.');
}
```

## Archive operations

### `convertArchive(input, targetType, options?)`

Converts an archive to `zip`, `rar`, `tar`, `asar`, or `7z`. Entries are copied as-is unless image conversion is requested. Writing RAR is unsupported and throws `UnsupportedOperationError`. ACE is not supported in either direction: converting an ACE archive to another format, or converting to `'ace'`, both throw `UnsupportedOperationError`.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.
- `targetType: 'zip' | 'rar' | 'tar' | 'asar' | '7z' | 'ace'` - The output container format.
- `options.tempDir?: string` - Directory for staging operations that need real files, notably ASAR writes and all 7z operations.
- `options.output?: string | Writable` - Output file path or writable stream. Without it, the function returns `Promise<Buffer>`.
- `options.image?: { format: ImageOutputFormat; options?: ImageConvertOptions }` - Re-encode image entries while converting the archive.
- `options.image.format` - `'webp'`, `'jpg'`, or `'png'`.
- `options.image.options` - Image format options described under [`convertImageBuffer`](#convertimagebuffer).

**Example**

```js
import { convertArchive } from '@clearmist-labs/comic-archive-handler';

const output = await convertArchive('/books/example.cbr', 'zip', {
  output: '/books/example.cbz',
  image: { format: 'webp', options: { webp: { quality: 92 } } },
});
```

### `listArchiveFiles(input)`

Lists every entry path in an archive, in archive iteration order. It returns paths only; entry contents are not read.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.

**Example**

```js
const files = await cah.listArchiveFiles(comicBuffer);
console.log(files); // ['P00001.jpg', 'ComicInfo.xml', ...]
```

### `readArchiveEntry(input, entryPath)`

Reads one archive entry and returns its contents as a `Buffer`. Throws `MetadataNotFoundError` when the entry does not exist.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.
- `entryPath: string` - Exact archive entry path.

**Example**

```js
const page = await cah.readArchiveEntry(comicBuffer, 'P00001.jpg');
```

### `readArchiveEntries(input)`

Reads every entry's contents and SHA256 in a single pass over the archive, yielding `{ path, size?, buffer, sha256 }` in archive iteration order. Prefer this over calling `readArchiveEntry`/`sha256ArchiveEntry` once per entry: zip and asar support real random access, but the sequential/CLI-driven formats (rar, 7z, ace, tar) re-scan the archive from the start on every such call — reading every entry that way costs O(n^2) instead of O(n) for those formats. It also avoids reading each entry's data twice (once for the hash, once for the buffer).

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.

**Example**

```js
for await (const entry of cah.readArchiveEntries(comicBuffer)) {
  console.log(entry.path, entry.sha256);
}
```

### `renameArchiveImagesSequentially(input, options?)`

Renames image entries in natural-sort order to `P#####.<extension>`, while leaving other entries unchanged.

**Options**

- `options.start?: number` - First page number. Defaults to `1`.
- `options.pad?: number` - Number of digits in the page number. Defaults to `5`.
- `options.tempDir?: string` - Temporary staging directory for ASAR or 7z operations.
- `options.output?: string | Writable` - Output destination. Without it, returns a `Buffer`.

**Example**

```js
const renamed = await cah.renameArchiveImagesSequentially(comicBuffer, {
  start: 0,
  pad: 4,
});
// Images become P0000.jpg, P0001.jpg, ...
```

### `extractArchive(input, destDir, options?)`

Extracts every entry in an archive to real files under `destDir`, preserving relative paths. `destDir` is created if it doesn't exist. Throws `ArchiveFormatError` for an undetectable format, or `UnsupportedOperationError` for ACE.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.
- `destDir: string` - Destination directory entries are written under.
- `options.tempDir?: string` - Temporary staging directory for 7z reads.

**Example**

```js
const files = await cah.extractArchive('/books/example.cbz', '/tmp/extracted');
console.log(files); // ['ComicInfo.xml', 'P00001.jpg', ...]
```

### `stripNonEssentialFiles(input, options?)`

Keeps image files and XML files, removing other archive entries such as thumbnails or desktop metadata.

**Options**

- `options.extraKeepExtensions?: string[]` - Additional extensions to preserve, without leading dots. Matching is case-insensitive.
- `options.tempDir?: string` - Temporary staging directory for ASAR or 7z operations.
- `options.output?: string | Writable` - Output destination. Without it, returns a `Buffer`.

**Example**

```js
const cleaned = await cah.stripNonEssentialFiles(comicBuffer, {
  extraKeepExtensions: ['json'],
});
```

## Metadata

`ComicMetadata` is the canonical metadata shape, covering every field defined by both bundled schemas (`schemas/ComicInfo v2.1.xsd` and `schemas/MetronInfo v1.1.xsd`) — see [`schemaVersions.ts`](../src/metadata/schemaVersions.ts) if those XSDs are ever upgraded. Conversion between ComicInfo.xml and MetronInfo.xml is intentionally lossy when a field has no equivalent in the target schema; the complete field mapping is maintained in `src/metadata/schema.ts`.

List fields that MetronInfo represents as an element with an optional `id` attribute (`genres`, `tags`, `characters`, `teams`, `locations`, `stories`, `reprints`) accept either a plain string or a `{ name, id? }` object (see [`MetronResource`](#types)); the `id` is preserved on round-trip through MetronInfo.xml and dropped when writing ComicInfo.xml, which has no equivalent concept.

### `metadataToComicInfoXml(metadata)`

Serializes canonical metadata to a ComicInfo.xml document string. Elements are written in the exact order required by the schema's `xs:sequence`.

**Options**

- `metadata: ComicMetadata` - Canonical metadata. In addition to the common fields (`title`, `series`, `number`, `summary`, `genres`, `tags`, `credits`, `pages`), this writes ComicInfo-specific fields: `blackAndWhite`, `manga`, `alternateSeries`, `alternateNumber`, `alternateCount`, `scanInformation`, `seriesGroup`, `mainCharacterOrTeam`, and `review`.

**Example**

```js
const xml = cah.metadataToComicInfoXml({
  title: 'The Example',
  series: 'Examples',
  number: '1',
  genres: ['Adventure'],
  credits: [{ name: 'Jane Doe', role: 'Writer' }],
});
```

### `comicInfoXmlToMetadata(xml)`

Parses a ComicInfo.xml string or `Buffer` into canonical metadata.

**Options**

- `xml: string | Buffer` - ComicInfo.xml content.

**Example**

```js
const metadata = cah.comicInfoXmlToMetadata(xml);
console.log(metadata.series);
```

### `metadataToMetronInfoXml(metadata)`

Serializes canonical metadata to a MetronInfo.xml document string.

**Options**

- `metadata: ComicMetadata` - Canonical metadata. In addition to the common fields, MetronInfo supports fields with no ComicInfo equivalent: `identifiers` (external database links), `publisherId`, `imprintId`, `seriesId`, `seriesLang`, `seriesStartYear`, `seriesIssueCount`, `seriesVolumeCount`, `seriesAlternativeNames`, `mangaVolume`, `collectionTitle`, `stories`, `prices`, `universes`, `reprints`, `communityRatingCount`, `gtinUpc`, and `lastModified`. Credits accept optional `creatorId`/`roleId`, and story arcs accept an optional `id`.

**Example**

```js
const xml = cah.metadataToMetronInfoXml({
  series: 'Examples',
  seriesSort: 'Examples',
  number: '1',
  coverDate: { year: 2026, month: 9, day: 12 },
  identifiers: [{ source: 'Metron', value: '12345', primary: true }],
});
```

### `metronInfoXmlToMetadata(xml)`

Parses a MetronInfo.xml string or `Buffer` into canonical metadata.

**Options**

- `xml: string | Buffer` - MetronInfo.xml content.

**Example**

```js
const metadata = cah.metronInfoXmlToMetadata(metronXml);
console.log(metadata.coverDate);
```

### `metadataToXml(metadata, schema)` and `xmlToMetadata(xml, schema)`

Schema-selecting wrappers around the format-specific metadata converters.

**Options**

- `metadata: ComicMetadata` or `xml: string | Buffer` - Metadata object or XML document.
- `schema: 'ComicInfo' | 'MetronInfo'` - XML schema to write or parse.

**Example**

```js
const xml = cah.metadataToXml({ title: 'Example' }, 'ComicInfo');
const metadata = cah.xmlToMetadata(xml, 'ComicInfo');
```

### `validateMetadataXml(xml, schema)`

Validates an XML document against the bundled XSD for `'ComicInfo'` or `'MetronInfo'`, using [`xmllint-wasm`](https://www.npmjs.com/package/xmllint-wasm) (a WASM build of libxml2 — no native or Java dependency). Returns `{ valid, issues }`; `issues` is empty when the document conforms, otherwise it has one entry per schema violation with the offending element/attribute in `message` and, where available, a `line` number.

Because the validator implements XSD 1.0, it cannot check the two `<xs:assert>` business rules in MetronInfo.xml v1.1 (at most one primary `URL`, at most one primary `ID`); everything else in both schemas is enforced.

**Options**

- `xml: string | Buffer` - XML document to validate.
- `schema: 'ComicInfo' | 'MetronInfo'` - Schema to validate against.

**Example**

```js
const xml = cah.metadataToComicInfoXml({ title: 'The Example' });
const { valid, issues } = await cah.validateMetadataXml(xml, 'ComicInfo');

if (!valid) {
  // Find out why your schema is invalid.
  for (const issue of issues) {
    console.log(issue.line, issue.message);
  }
}
```

### `hasComicMetadata(input)`

Checks for a root-level or nested `ComicInfo.xml` or `MetronInfo.xml` entry without parsing it. Returns `{ present, schema?, path? }`.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.

**Example**

```js
const result = await cah.hasComicMetadata(comicBuffer);
if (result.present) {
  console.log(result.schema, result.path);
}
```

### `readArchiveMetadata(input)`

Finds and parses the first recognized metadata entry. Returns `{ schema, metadata }`, or `null` when no metadata file is present.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.

**Example**

```js
const result = await cah.readArchiveMetadata(comicBuffer);
console.log(result?.metadata.title);
```

### `addMetadataToArchive(input, metadata, schema, options?)`

Adds a `ComicInfo.xml` or `MetronInfo.xml` entry to an archive. Existing metadata is rejected unless `overwrite: true` is supplied.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.
- `metadata: ComicMetadata` - Metadata to serialize.
- `schema: 'ComicInfo' | 'MetronInfo'` - Metadata file to create or replace.
- `options.overwrite?: boolean` - Replace an existing matching file. Defaults to `false`.
- `options.tempDir?: string` - Temporary staging directory for ASAR or 7z operations.
- `options.output?: string | Writable` - Output destination. Without it, returns a `Buffer`.

**Example**

```js
const withMetadata = await cah.addMetadataToArchive(
  comicBuffer,
  {
    title: 'The Example',
    series: 'Examples',
    number: '1',
  },
  'ComicInfo',
  { overwrite: true },
);
```

## Image conversion and detection

### `convertImageBuffer(image, format, options?)`

Re-encodes an image `Buffer` as WebP, JPEG, or PNG.

**Options**

- `image: Buffer` - Input image bytes.
- `format: 'webp' | 'jpg' | 'png'` - Output format.
- `options.webp.quality?: number` - WebP quality. Defaults to `92`.
- `options.webp.effort?: number` - WebP compression effort from `0` to `6`. Defaults to `6`.
- `options.webp.smartSubsample?: boolean` - Use sharp YUV subsampling. Defaults to `true`.
- `options.jpeg.quality?: number` - JPEG quality. Defaults to `90`.
- `options.png.quality?: number` - PNG palette quality; only effective when `palette` is `true`.
- `options.png.compressionLevel?: number` - PNG zlib compression level from `0` to `9`.
- `options.png.palette?: boolean` - Enable lossy palette quantization.

**Example**

```js
const webp = await cah.convertImageBuffer(jpegBytes, 'webp', {
  webp: { quality: 90, effort: 6, smartSubsample: true },
});
```

### `convertArchiveImages(input, format, options?)`

Re-encodes image entries in an archive and updates their extensions. Non-image entries are copied unchanged.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.
- `format: 'webp' | 'jpg' | 'png'` - Output image format.
- `options.webp`, `options.jpeg`, `options.png` - Format-specific options listed under [`convertImageBuffer`](#convertimagebuffer).
- `options.tempDir?: string` - Temporary staging directory for ASAR or 7z operations.
- `options.output?: string | Writable` - Output destination. Without it, returns a `Buffer`.

**Example**

```js
const webpArchive = await cah.convertArchiveImages(comicBuffer, 'webp', {
  webp: { quality: 92 },
  output: '/books/example-webp.cbz',
});
```

### `IMAGE_EXTENSIONS`

Readonly list of recognized image extensions: `jpg`, `jpeg`, `png`, `gif`, `webp`, `bmp`, `tiff`, and `tif`.

**Options**

This constant has no options.

**Example**

```js
console.log(cah.IMAGE_EXTENSIONS.includes('webp')); // true
```

### `getExtension(entryPath)`

Returns the lower-case extension from an archive entry path, without the leading dot. Returns an empty string when there is no extension.

**Options**

- `entryPath: string` - Archive entry path.

**Example**

```js
console.log(cah.getExtension('pages/P00001.JPEG')); // 'jpeg'
```

### `isImagePath(entryPath)`

Returns whether an archive entry path has an extension in `IMAGE_EXTENSIONS`.

**Options**

- `entryPath: string` - Archive entry path.

**Example**

```js
if (cah.isImagePath('P00001.jpg')) console.log('page image');
```

## Perceptual hashing

### `computeImagePHash(image)`

Computes a standard 64-bit DCT perceptual hash from an image `Buffer`. The result is a `bigint`.

**Options**

- `image: Buffer` - Input image bytes.

**Example**

```js
const hash = await cah.computeImagePHash(imageBytes);
const hex = cah.phashToHex(hash);
```

### `computeArchiveImagePHash(input, entryPath)`

Reads one archive entry and computes its image perceptual hash. Throws `MetadataNotFoundError` when the entry does not exist.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.
- `entryPath: string` - Exact archive entry path.

**Example**

```js
const hash = await cah.computeArchiveImagePHash(comicBuffer, 'P00001.jpg');
```

### `phashToHex(hash)`

Formats a 64-bit perceptual hash as a zero-padded 16-character hexadecimal string.

**Options**

- `hash: bigint` - Perceptual hash returned by `computeImagePHash` or `computeArchiveImagePHash`.

**Example**

```js
console.log(cah.phashToHex(15n)); // '000000000000000f'
```

### `hammingDistance(a, b)`

Counts the differing bits between two perceptual hashes. Lower values indicate greater similarity.

**Options**

- `a: bigint` - First 64-bit hash.
- `b: bigint` - Second 64-bit hash.

**Example**

```js
const distance = cah.hammingDistance(hashA, hashB);
if (distance <= 5) console.log('Likely similar pages');
```

## SHA-256 hashing

### `sha256ArchiveEntry(input, entryPath)`

Returns the lower-case SHA-256 digest of one archive entry's uncompressed content. Throws `MetadataNotFoundError` when the entry does not exist.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.
- `entryPath: string` - Exact archive entry path.

**Example**

```js
const digest = await cah.sha256ArchiveEntry(comicBuffer, 'P00001.jpg');
```

### `sha256Archive(input)`

Returns the lower-case SHA-256 digest of the entire archive. For ASAR, only the content region is hashed, excluding the header and file index.

**Options**

- `input: ArchiveInput` - A filesystem path or archive `Buffer`.

**Example**

```js
const digest = await cah.sha256Archive('/books/example.cbz');
```

## Benchmarking

### `benchmarkArchive(filePath, options?)`

Extracts a comic archive into the report's `source/` subdirectory, validates it contains image files, then generates one archive per writable container format (`zip`, `tar`, `asar`, `7z`) times benchmarked page image format (`webp`, `png`, `jpg` by default, or a subset via `options.imageFormats`) — 12 variants in total by default, each containing only the original's XML and image entries, always re-encoded from the untouched source pages (never from a previously-converted variant). Benchmarks each variant's average archive-creation time (packaging only — images are re-encoded once per format before timing starts) and average random single-entry read time, writes the generated archives and a markdown report to a timestamped subdirectory, and returns the results.

Throws `ArchiveFormatError` (undetectable format) or `UnsupportedOperationError` (ACE) if `filePath` isn't extractable, `NoImagesFoundError` if the archive has no image files, `FilesystemAccessError` if `filePath` doesn't exist, and `RangeError` if `options.imageFormats` is empty or names an unsupported format.

**Options**

- `filePath: string` - Filesystem path to the source archive.
- `options.tempDir?: string` - Staging directory for extraction and any asar/7z operations. Defaults to a fresh directory under the OS temp dir.
- `options.reportsDir?: string` - Directory the dated report subdirectory is created under. Defaults to `./reports` (relative to `process.cwd()`).
- `options.creationIterations?: number` - Timed creation runs to average per variant. Defaults to `3`, minimum `1`.
- `options.seekSamples?: number` - Random single-entry reads to average per variant. Defaults to `10`, minimum `1`.
- `options.imageFormats?: ImageOutputFormat[]` - Image formats to benchmark. Defaults to all of `BENCHMARK_IMAGE_FORMATS` (`webp`, `png`, `jpg`). Must be non-empty and only name supported formats.
- `options.image?: ImageConvertOptions` - Image encode options (`webp`, `jpeg`, `png`) applied uniformly across every generated variant.

**Example**

```js
const result = await cah.benchmarkArchive('/books/example.cbz', {
  reportsDir: './reports',
  creationIterations: 5,
  seekSamples: 20,
});

console.log(result.reportPath); // ./reports/2026-09-12T19-47-00Z/report.md
for (const variant of result.variants) {
  console.log(variant.archiveType, variant.imageFormat, variant.fileSizeBytes, variant.avgSeekMs);
}
```

### `renderBenchmarkReportMarkdown(result)`

Renders a `BenchmarkArchiveResult` (as returned by `benchmarkArchive`) to the markdown report text, including the results table and the ranked summary sections. `benchmarkArchive` calls this internally to write `report.md`; exported for callers that want the markdown without re-running the benchmark (e.g. to regenerate a report from a saved result).

**Options**

- `result: BenchmarkArchiveResult`

**Example**

```js
const markdown = cah.renderBenchmarkReportMarkdown(result);
```

### `WRITABLE_ARCHIVE_TYPES`, `BENCHMARK_IMAGE_FORMATS`, `ARCHIVE_TYPE_EXTENSIONS`

Constants describing the combinations `benchmarkArchive` generates: the writable container formats (`'zip' | 'tar' | 'asar' | '7z'`), the benchmarked image formats (`'webp' | 'png' | 'jpg'`), and the conventional comic-archive extension for each container format (`{ zip: 'cbz', tar: 'cbt', asar: 'cbas', '7z': 'cb7' }`).

**Options**

These constants have no options.

**Example**

```js
console.log(cah.WRITABLE_ARCHIVE_TYPES); // ['zip', 'tar', 'asar', '7z']
```

## Types

The following types are exported for TypeScript consumers.

- `ArchiveType` - `'zip' | 'rar' | 'tar' | 'asar' | '7z' | 'ace' | 'unknown'`.
- `ArchiveInput` - `Buffer | string`.
- `MetadataSchema` - `'ComicInfo' | 'MetronInfo'`.
- `ImageOutputFormat` - `'webp' | 'jpg' | 'png'`.
- `ArchiveWriteOptions` - Shared `tempDir?` and `output?` options.
- `ConvertArchiveOptions` - Archive write options plus `image?: { format, options? }`.
- `AddMetadataOptions` - Archive write options plus `overwrite?: boolean`.
- `RenameOptions` - Archive write options plus `start?: number` and `pad?: number`.
- `StripOptions` - Archive write options plus `extraKeepExtensions?: string[]`.
- `ImageConvertOptions` - `webp?`, `jpeg?`, and `png?` format option groups.
- `WebpOptions` - `quality?`, `effort?`, and `smartSubsample?`.
- `JpegOptions` - `quality?`.
- `PngOptions` - `quality?`, `compressionLevel?`, and `palette?`.
- `ComicMetadata` - Canonical metadata object; see the metadata section above.
- `ComicCredit` - `{ name: string; role: string; creatorId?: string; roleId?: string }`. The `*Id` fields are MetronInfo-only (`Creator`/`Role` `id` attributes).
- `ComicStoryArc` - `{ name: string; number?: number; id?: string }`. `id` is MetronInfo-only (`Arc` `id` attribute).
- `ComicPage` - Page index and optional page attributes such as `type`, `doublePage`, dimensions, `key`, and `bookmark`.
- `ComicDate` - Optional numeric `year`, `month`, and `day`.
- `ComicInfoCreditRole` - One of the roles in `COMIC_INFO_CREDIT_ROLES`.
- `MetronResource` - `{ name: string; id?: string }`. Used for MetronInfo list items (`genres`, `tags`, `characters`, `teams`, `locations`, `stories`, `reprints`) that carry an optional database `id`; a plain `string` is accepted anywhere this type is expected.
- `ComicAlternativeName` - `MetronResource & { lang?: string }`. Used for `seriesAlternativeNames`.
- `ComicUniverse` - `{ name: string; designation?: string; id?: string }`. Used for `universes`.
- `ComicPrice` - `{ amount: number; country: string }`. Used for `prices`.
- `ComicUrl` - `{ url: string; primary?: boolean }`. Used for `web` entries when a MetronInfo `primary` flag is needed; a plain `string` is accepted too.
- `ComicIdentifier` - `{ source: string; value: string; primary?: boolean }`. Used for `identifiers` (MetronInfo `IDS > ID`).
- `MetadataValidationResult` - `{ valid: boolean; issues: MetadataValidationIssue[] }`, returned by `validateMetadataXml`.
- `MetadataValidationIssue` - `{ message: string; line?: number }`.
- `ExtractArchiveOptions` - `{ tempDir?: string }`.
- `WritableArchiveType` - `'zip' | 'tar' | 'asar' | '7z'`.
- `BenchmarkArchiveOptions` - `{ tempDir?, reportsDir?, creationIterations?, seekSamples?, imageFormats?, image? }`; see [`benchmarkArchive`](#benchmarkarchivefilepath-options).
- `BenchmarkVariantResult` - One generated variant's stats: `{ archiveType, imageFormat, fileName, filePath, fileSizeBytes, pageCount, avgImageSizeBytes, avgCreationMs, avgSeekMs }`. `avgImageSizeBytes` (average size of one converted page) depends only on `imageFormat`, not `archiveType`.
- `BenchmarkArchiveResult` - `{ sourcePath, generatedAt, reportDir, reportPath, sourceDir, archivesDir, variants: BenchmarkVariantResult[] }`, returned by `benchmarkArchive`. `sourceDir` holds every entry extracted from the source archive, for inspection alongside the generated `archivesDir` and `reportPath`.

**Example**

```ts
import type { ComicMetadata, ConvertArchiveOptions } from '@clearmist-labs/comic-archive-handler';

const metadata: ComicMetadata = { title: 'The Example', number: '1' };
const options: ConvertArchiveOptions = { output: './example.cbz' };
```

## Metadata helpers

### `COMIC_INFO_CREDIT_ROLES`

Readonly list of ComicInfo credit role names supported by the converter: `Writer`, `Penciller`, `Inker`, `Colorist`, `Letterer`, `CoverArtist`, `Editor`, and `Translator`.

**Options**

This constant has no options.

**Example**

```js
for (const role of cah.COMIC_INFO_CREDIT_ROLES) console.log(role);
```

### `splitCommaList(value?)` and `joinCommaList(values?)`

Small helpers for converting between comma-separated strings and string arrays. Empty input produces `undefined`.

**Options**

- `splitCommaList(value?: string)` - Comma-separated text; whitespace around items is trimmed.
- `joinCommaList(values?: string[])` - Values to join with a comma and a space.

**Example**

```js
const values = cah.splitCommaList('Writer, Penciller');
const text = cah.joinCommaList(values);
console.log(text); // 'Writer, Penciller'
```

### `resourceName(item)` and `resourceId(item)`

Helpers for reading a `string | MetronResource` list item (see [`MetronResource`](#types)) without a type check at every call site.

**Options**

- `resourceName(item: string | MetronResource)` - Returns the plain text value.
- `resourceId(item: string | MetronResource)` - Returns the MetronInfo `id` attribute, or `undefined` for a plain string.

**Example**

```js
const genre = { name: 'Action', id: 'genre-1' };
console.log(cah.resourceName(genre), cah.resourceId(genre)); // 'Action' 'genre-1'
console.log(cah.resourceName('Adventure'), cah.resourceId('Adventure')); // 'Adventure' undefined
```

### `joinResourceNames(values?)`

Like `joinCommaList`, but accepts `(string | MetronResource)[]` and joins the plain names, discarding any `id`. Used internally to write ComicInfo's comma-separated `Genre`/`Tags`/`Characters`/`Teams`/`Locations` fields from list values that may carry MetronInfo `id` attributes.

**Options**

- `values?: (string | MetronResource)[]`

**Example**

```js
console.log(cah.joinResourceNames([{ name: 'Action', id: 'genre-1' }, 'Adventure'])); // 'Action, Adventure'
```

### Schema reference enums

Readonly value lists for the enumerated (`xs:enumeration`) types in each XSD. These are reference data, not enforced constraints — fields such as `ageRating` remain plain `string` so unrecognized or future values still round-trip.

- `COMIC_INFO_YES_NO_VALUES` - `'Unknown' | 'No' | 'Yes'` (ComicInfo `BlackAndWhite`).
- `COMIC_INFO_MANGA_VALUES` - `'Unknown' | 'No' | 'Yes' | 'YesAndRightToLeft'` (ComicInfo `Manga`).
- `COMIC_INFO_AGE_RATING_VALUES` - ComicInfo `AgeRating` values, e.g. `'Everyone'`, `'Teen'`, `'Mature 17+'`.
- `COMIC_INFO_PAGE_TYPE_VALUES` - ComicInfo `Pages > Page` `Type` attribute values, e.g. `'FrontCover'`, `'Story'`, `'BackCover'`.
- `METRON_FORMAT_VALUES` - MetronInfo `Series > Format` values, e.g. `'Single Issue'`, `'Trade Paperback'`.
- `METRON_INFORMATION_SOURCE_VALUES` - MetronInfo `IDS > ID` `source` attribute values, e.g. `'Comic Vine'`, `'Metron'`.
- `METRON_ROLE_VALUES` - MetronInfo `Credits > Credit > Roles > Role` values (a larger set than `COMIC_INFO_CREDIT_ROLES`).
- `METRON_AGE_RATING_VALUES` - MetronInfo `AgeRating` values — a different set from ComicInfo's.

**Example**

```js
if (!cah.METRON_ROLE_VALUES.includes(role)) console.warn(`Non-standard MetronInfo role: ${role}`);
```

## Errors

All custom errors extend `Error` and can be matched with `instanceof`.

### `UnsupportedOperationError`

The requested operation is not supported, such as writing a RAR archive, or reading, writing, or converting an ACE archive at all.

**Options**

- `message: string` - Error message.

**Example**

```js
try {
  await cah.convertArchive(input, 'rar');
} catch (error) {
  if (error instanceof cah.UnsupportedOperationError) console.log('RAR writing is unavailable');
}

try {
  await cah.convertArchive(cbaInput, 'zip');
} catch (error) {
  if (error instanceof cah.UnsupportedOperationError) console.log('ACE is unsupported entirely');
}
```

### `ArchiveFormatError`

The archive is invalid, undetectable, or conflicts with an operation such as adding duplicate metadata without overwrite enabled.

**Options**

- `message: string` - Error message.

**Example**

```js
try {
  await cah.addMetadataToArchive(input, metadata, 'ComicInfo');
} catch (error) {
  if (error instanceof cah.ArchiveFormatError) console.log(error.message);
}
```

### `MetadataNotFoundError`

The requested metadata or archive entry was not found.

**Options**

- `message: string` - Error message.

**Example**

```js
try {
  await cah.sha256ArchiveEntry(input, 'missing.jpg');
} catch (error) {
  if (error instanceof cah.MetadataNotFoundError) console.log('Entry missing');
}
```

### `FilesystemAccessError`

A required temporary or output filesystem operation could not be completed.

**Options**

- `message: string` - Error message.

**Example**

```js
try {
  await cah.convertArchive(input, 'asar', { tempDir: '/unwritable/path' });
} catch (error) {
  if (error instanceof cah.FilesystemAccessError) console.log(error.message);
}
```

### `SevenZipUnavailableError`

The bundled 7-Zip executable could not be found or started for a 7z operation.

**Options**

- `message: string` - Error message.

**Example**

```js
try {
  await cah.convertArchive(input, '7z');
} catch (error) {
  if (error instanceof cah.SevenZipUnavailableError) console.log('7z is unavailable');
}
```

### `NoImagesFoundError`

`benchmarkArchive` found no image entries in the source archive.

**Options**

- `message: string` - Error message.

**Example**

```js
try {
  await cah.benchmarkArchive('/books/metadata-only.cbz');
} catch (error) {
  if (error instanceof cah.NoImagesFoundError) console.log('No pages to benchmark');
}
```
