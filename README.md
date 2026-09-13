# @clearmist-labs/comic-archive-handler

[![CI](https://github.com/Clearmist/comic-archive-handler/actions/workflows/ci.yml/badge.svg)](https://github.com/Clearmist/comic-archive-handler/actions/workflows/ci.yml)

A toolkit for detecting, converting, and manipulating comic book archives (CBAS/CBZ/CB7/CBR/CBT/CBA).

- **Detect** archive types and container formats
- **Convert** between zip/rar/tar/asar/7z containers
- **Read & write** ComicInfo.xml/MetronInfo.xml metadata
- **Validate** metadata with full field coverage of both schemas and XSD-backed validation
- **Re-encode** page images to different formats
- **Hash** archives perceptually and by content
- **Rename** pages sequentially
- **Strip** non-essential files from archives
- **Extract** archives to a plain directory of files
- **Benchmark** archive/image format combinations for creation speed, random read speed, and size

## Installation

```sh
npm install @clearmist-labs/comic-archive-handler
```

## Usage

```js
import fs from 'node:fs/promises';
import cah from '@clearmist-labs/comic-archive-handler';
// or: import { detectArchiveType, convertArchive } from '@clearmist-labs/comic-archive-handler';

/* Convert a cbz to cba buffer */
const type = await cah.detectArchiveType('/path/to/comic.cbz'); // 'zip'
const asarBuffer = await cah.convertArchive('/path/to/comic.cbz', 'asar');

/* Inspect its metadata */
const { present, schema } = await cah.hasComicMetadata(asarBuffer);
const { metadata } = await cah.readArchiveMetadata(asarBuffer);

/* Add some more metadata then validate we did it correctly */
const withMetadata = await cah.addMetadataToArchive(asarBuffer, { title: 'Example', series: 'Example Series', number: '1' }, 'ComicInfo');
const { valid, issues } = await cah.validateMetadataXml(cah.metadataToComicInfoXml({ title: 'Example' }), 'ComicInfo');

/* Make sure our images use the standard naming format */
const renamed = await cah.renameArchiveImagesSequentially(withMetadata); // P00001.jpg, P00002.jpg, ...

/* Get rid of anything we don't recognize */
const stripped = await cah.stripNonEssentialFiles(renamed); // keeps only images + .xml

/* Convert all of the images to WebP */
const webp = await cah.convertArchiveImages(stripped, 'webp', { webp: { quality: 92, effort: 6, smartSubsample: true } });

/* Generate hashes */
const contentHash = await cah.sha256Archive(webp); // For asar this hashes only the content region (not the header/index).
const pageHash = await cah.sha256ArchiveEntry(webp, 'P00001.webp');
const phash = await cah.computeArchiveImagePHash(webp, 'P00001.webp'); // 64-bit bigint

/* Write the buffer to disk */
await fs.writeFile('/path/to/output.cba', webp);
```

### Streaming large archives to disk

Every archive-producing function accepts an `output` option (a file path or a `Writable`) to stream the result directly there instead of collecting it into a `Buffer`:

```js
await cah.convertArchive('/path/to/large.cbz', 'zip', { output: '/path/to/output.cbz' });
```

### Benchmarking archive/image format combinations

`benchmarkArchive` extracts a comic archive, generates every writable-container × page-image-format combination (12 archives: zip/tar/asar/7z × webp/png/jpg), times each one's creation and random single-page read speed, and writes the generated archives plus a markdown report to a timestamped `reports/<datetime>/` directory:

```js
const result = await cah.benchmarkArchive('/path/to/comic.cbz');
console.log(result.reportPath); // ./reports/2026-09-12T19-47-00Z/report.md
```

## API

See the [API reference](docs/API.md) for descriptions, options, examples, exported types, and custom errors.

Most runtime exports are available both as named exports and as properties on the default export. Type-only exports are available to TypeScript consumers but are not runtime properties of the default export.

## File format support

### Archive containers

| Format | Extension | Detectable | Readable | Writable |
| ------ | --------- | ---------- | -------- | -------- |
| Zip    | .cbz      | ✅         | ✅       | ✅       |
| Asar   | .cbas     | ✅         | ✅       | ✅       |
| 7z     | .cb7      | ✅         | ✅       | ✅       |
| Tar    | .cbt      | ✅         | ✅       | ✅       |
| Rar    | .cbr      | ✅         | ✅       | ❌       |
| Ace    | .cba      | ✅         | ❌       | ❌       |

Ace is a dead format and should never be used.

Rar is closed sourced. Writing rar files requires commercial software. I strongly suggest not using CBR as your archive choice.

Asar supports fully streaming reads: individual pages can be pulled out via direct byte-range access without extracting or decompressing the whole archive, making it the fastest option for random page access. This makes it the best choice for remote digital libraries; read and send a single page to a client without extracting the entire archive to disk.

### Page images

| Format | Detectable | Readable | Writable | Archival quality |
| ------ | ---------- | -------- | -------- | ---------------- |
| WebP   | ✅         | ✅       | ✅       | Excellent        |
| PNG    | ✅         | ✅       | ✅       | Excellent        |
| JPEG   | ✅         | ✅       | ✅       | Good             |
| GIF    | ✅         | ✅       | ❌       | Poor             |
| BMP    | ✅         | ✅       | ❌       | Poor             |
| TIFF   | ✅         | ✅       | ❌       | Poor             |

The best choice for image quality and size is WebP at quality 90 to 95.

The best choice for wide compatibility across very old devices is JPG.

GIF, BMP, and TIFF are intentionally not included as writable because of their poor image quality or large file size.

## Notes and known limitations

- **ACE (CBA) is entirely unsupported.** ACE archives are still detected (`detectArchiveType`/`isAce`), but every read, write, and conversion operation throws `UnsupportedOperationError`: ACE is a dead format that hasn't been updated since 2011, has multiple known security vulnerabilities, and has no maintained JS/WASM decoder or bundleable cross-platform binary to build support on.
- **RAR is read-only.** The UnRAR source license permits decompression only, not building a compatible compressor, so `convertArchive(input, 'rar')` always throws `UnsupportedOperationError`.
- **7z read/write** uses the standalone `7zzs` binary bundled by [`7zip-bin-full`](https://www.npmjs.com/package/7zip-bin-full), spawned directly (not through `node-7z`, which has no way to control the child process's working directory). Both directions round-trip through a temporary staging directory since the 7-Zip CLI operates on real files, not in-memory buffers.
- **asar** reads are fully streaming (direct byte-range reads against the archive, no extraction), but writes require a staging directory since `@electron/asar`'s `createPackage` API only accepts a source directory on disk.
- Any operation that needs a staging directory (asar writes, any 7z operation) accepts a `tempDir` option; if omitted, a directory under `os.tmpdir()` is used, and a clear `FilesystemAccessError` is thrown if no writable directory is available.
- Metadata conversion between the canonical schema and ComicInfo.xml/MetronInfo.xml is intentionally lossy in both directions. See the field-mapping table in `src/metadata/schema.ts`.
- PNG conversion's `quality` option only has an effect when `palette: true` is also set (an upstream `sharp`/libvips behavior).

## Official schemas

These are separate works and are included here to help us validate schemas against the officialy published schemas.

- [ComicInfo.xml](https://github.com/anansi-project/comicinfo) / MIT
- [MetronInfo.xml](https://github.com/Metron-Project/metroninfo) / LGPL-2.1

## License

MIT
