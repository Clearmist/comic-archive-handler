import type { Writable } from 'node:stream';

export type ArchiveType = 'zip' | 'rar' | 'tar' | 'asar' | '7z' | 'ace' | 'unknown';

/** A Buffer of the archive's full bytes, or a filesystem path to it. */
export type ArchiveInput = Buffer | string;

export type MetadataSchema = 'ComicInfo' | 'MetronInfo';

export type ImageOutputFormat = 'webp' | 'jpg' | 'png';

export interface WebpOptions {
  /** Default 92. */
  quality?: number;
  /** libwebp's `-m` compression method (0-6). Default 6. */
  effort?: number;
  /** libwebp's `-sharp_yuv`. Default true. */
  smartSubsample?: boolean;
}

export interface JpegOptions {
  /** Default 90. */
  quality?: number;
}

export interface PngOptions {
  /** Only has an effect when `palette` is true. */
  quality?: number;
  /** Zlib compression level (0-9). */
  compressionLevel?: number;
  /** Enables lossy palette quantization (required for `quality` to matter). */
  palette?: boolean;
}

export interface ImageConvertOptions {
  webp?: WebpOptions;
  jpeg?: JpegOptions;
  png?: PngOptions;
}

/** Shared by every archive-producing operation. */
export interface ArchiveWriteOptions {
  /**
   * Directory to stage temporary files in when the source or target format
   * requires real filesystem access (asar writes, any 7z operation).
   * Defaults to a fresh directory under `os.tmpdir()`. If that isn't
   * writable and no override is given, a FilesystemAccessError is thrown.
   */
  tempDir?: string;
  /**
   * When given, the result is streamed directly here and the function
   * resolves `Promise<void>` instead of collecting a final Buffer.
   */
  output?: string | Writable;
}

export interface ConvertArchiveOptions extends ArchiveWriteOptions {
  image?: { format: ImageOutputFormat; options?: ImageConvertOptions };
}

export interface AddMetadataOptions extends ArchiveWriteOptions {
  overwrite?: boolean;
}

export interface RenameOptions extends ArchiveWriteOptions {
  start?: number;
  pad?: number;
}

export interface StripOptions extends ArchiveWriteOptions {
  extraKeepExtensions?: string[];
}

export interface ComicCredit {
  name: string;
  role: string;
  /** MetronInfo Credits > Credit > Creator `id` attribute. */
  creatorId?: string;
  /** MetronInfo Credits > Credit > Roles > Role `id` attribute for this role. */
  roleId?: string;
}

export interface ComicStoryArc {
  name: string;
  number?: number;
  /** MetronInfo Arcs > Arc `id` attribute. */
  id?: string;
}

export interface ComicPage {
  index: number;
  type?: string;
  doublePage?: boolean;
  imageSize?: number;
  imageWidth?: number;
  imageHeight?: number;
  key?: string;
  bookmark?: string;
}

export interface ComicDate {
  year?: number;
  month?: number;
  day?: number;
}

/**
 * MetronInfo represents most list values (Genre, Tag, Character, Team,
 * Location, Reprint, Story, Publisher > Imprint) as an element with a
 * required text value and an optional `id` attribute linking it back to
 * Metron's database. Plain strings are accepted anywhere this type is
 * expected and are written without an `id` attribute.
 */
export interface MetronResource {
  name: string;
  id?: string;
}

export interface ComicAlternativeName extends MetronResource {
  /** Two-letter language code. Defaults to "en" per the schema. */
  lang?: string;
}

export interface ComicUniverse {
  name: string;
  designation?: string;
  id?: string;
}

export interface ComicPrice {
  amount: number;
  /** Two-letter ISO country code. */
  country: string;
}

export interface ComicUrl {
  url: string;
  primary?: boolean;
}

/** MetronInfo IDS > ID: a link to an external database record. */
export interface ComicIdentifier {
  source: string;
  value: string;
  primary?: boolean;
}

/**
 * Canonical metadata shape: a superset/union of ComicInfo.xml and
 * MetronInfo.xml fields. Conversion to either schema is intentionally lossy
 * for fields the target schema has no equivalent for; see
 * src/metadata/schema.ts for the authoritative field-mapping table.
 */
export interface ComicMetadata {
  title?: string;
  series?: string;
  seriesSort?: string;
  volume?: string;
  number?: string;
  /** Shared: ComicInfo `AlternateNumber` <-> MetronInfo `AlternativeNumber`. */
  alternateNumber?: string;
  count?: number;
  pageCount?: number;
  summary?: string;
  notes?: string;
  publisher?: string;
  imprint?: string;
  format?: string;
  language?: string;
  ageRating?: string;
  communityRating?: number;
  coverDate?: ComicDate;
  storeDate?: ComicDate;
  genres?: (string | MetronResource)[];
  tags?: (string | MetronResource)[];
  characters?: (string | MetronResource)[];
  teams?: (string | MetronResource)[];
  locations?: (string | MetronResource)[];
  storyArcs?: ComicStoryArc[];
  credits?: ComicCredit[];
  web?: (string | ComicUrl)[];
  /** ComicInfo `GTIN`, or MetronInfo `GTIN > ISBN`. */
  gtin?: string;
  /** MetronInfo `GTIN > UPC`. MetronInfo allows ISBN and UPC to coexist. */
  gtinUpc?: string;
  /** ComicInfo-only. */
  blackAndWhite?: boolean;
  /** ComicInfo-only. */
  manga?: string;
  pages?: ComicPage[];

  /** ComicInfo-only: a series this issue is an alternate printing/edition of. */
  alternateSeries?: string;
  /** ComicInfo-only: issue count for `alternateSeries`. */
  alternateCount?: number;
  /** ComicInfo-only: scanning/rip group notes. */
  scanInformation?: string;
  /** ComicInfo-only: umbrella grouping across a series (e.g. a crossover event). */
  seriesGroup?: string;
  /** ComicInfo-only. */
  mainCharacterOrTeam?: string;
  /** ComicInfo-only: reviewer notes/text. */
  review?: string;

  /** MetronInfo-only: external database links (Comic Vine, Metron, etc). */
  identifiers?: ComicIdentifier[];
  /** MetronInfo Publisher `id` attribute. */
  publisherId?: string;
  /** MetronInfo Publisher > Imprint `id` attribute. */
  imprintId?: string;
  /** MetronInfo Series `id` attribute. */
  seriesId?: string;
  /** MetronInfo Series `lang` attribute. Defaults to "en" per the schema. */
  seriesLang?: string;
  /** MetronInfo Series > StartYear. */
  seriesStartYear?: number;
  /** MetronInfo Series > IssueCount. */
  seriesIssueCount?: number;
  /** MetronInfo Series > VolumeCount. */
  seriesVolumeCount?: number;
  /** MetronInfo Series > AlternativeNames. */
  seriesAlternativeNames?: ComicAlternativeName[];
  /** MetronInfo-only: volume label used for manga. */
  mangaVolume?: string;
  /** MetronInfo-only. */
  collectionTitle?: string;
  /** MetronInfo-only: story titles collected in this issue. */
  stories?: (string | MetronResource)[];
  /** MetronInfo-only. */
  prices?: ComicPrice[];
  /** MetronInfo-only: other issues this one reprints. */
  reprints?: (string | MetronResource)[];
  /** MetronInfo-only. */
  universes?: ComicUniverse[];
  /** MetronInfo CommunityRating > RatingCount (pairs with `communityRating` as the average). */
  communityRatingCount?: number;
  /** MetronInfo-only, ISO 8601 datetime string. */
  lastModified?: string;

  /** Round-trip escape hatch: original ComicInfo-only fields, kept only when source and target schema are the same. */
  comicInfoExtra?: Record<string, unknown>;
  /** Round-trip escape hatch: original MetronInfo-only fields, kept only when source and target schema are the same. */
  metronInfoExtra?: Record<string, unknown>;
}
