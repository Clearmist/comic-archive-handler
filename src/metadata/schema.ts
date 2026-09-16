export type {
  ComicMetadata,
  ComicCredit,
  ComicStoryArc,
  ComicPage,
  ComicDate,
  MetadataSchema,
  MetronResource,
  ComicAlternativeName,
  ComicUniverse,
  ComicPrice,
  ComicUrl,
  ComicIdentifier,
} from '../types.js';
import type { MetronResource } from '../types.js';

/**
 * Authoritative field-mapping table between the canonical ComicMetadata
 * shape and each external XML schema (ComicInfo.xml v2.1, MetronInfo.xml
 * v1.1. See `schemas/`). Conversion is intentionally lossy in both
 * directions; a field with no equivalent in the target schema is dropped
 * unless the source and target schema happen to be the same one (in which
 * case `comicInfoExtra`/`metronInfoExtra` round-trips it).
 *
 * | Canonical field         | ComicInfo.xml                                      | MetronInfo.xml                                |
 * |-------------------------|-----------------------------------------------------|------------------------------------------------|
 * | title                   | Title                                               | (no equivalent; dropped)                       |
 * | series                  | Series                                              | Series > Name                                   |
 * | seriesSort              | (no equivalent)                                     | Series > SortName                               |
 * | seriesId / seriesLang   | (no equivalent)                                     | Series `id`/`lang` attributes                   |
 * | seriesStartYear         | (no equivalent)                                     | Series > StartYear                              |
 * | seriesIssueCount        | (no equivalent)                                     | Series > IssueCount                             |
 * | seriesVolumeCount       | (no equivalent)                                     | Series > VolumeCount                            |
 * | seriesAlternativeNames  | (no equivalent)                                     | Series > AlternativeNames > AlternativeName[]   |
 * | seriesGroup             | SeriesGroup                                         | (no equivalent; dropped)                       |
 * | volume                  | Volume                                              | Series > Volume                                 |
 * | number                  | Number                                              | Number                                          |
 * | alternateNumber         | AlternateNumber                                     | AlternativeNumber                               |
 * | alternateSeries         | AlternateSeries                                     | (no equivalent; dropped)                       |
 * | alternateCount          | AlternateCount                                      | (no equivalent; dropped)                       |
 * | count                   | Count                                               | (no equivalent)                                 |
 * | pageCount               | PageCount                                           | PageCount                                       |
 * | summary                 | Summary                                             | Summary                                         |
 * | notes                   | Notes                                               | Notes                                           |
 * | review                  | Review                                              | (no equivalent; dropped)                       |
 * | scanInformation         | ScanInformation                                     | (no equivalent; dropped)                       |
 * | publisher / publisherId | Publisher                                           | Publisher > Name / `id` attribute               |
 * | imprint / imprintId     | Imprint                                             | Publisher > Imprint / `id` attribute            |
 * | collectionTitle         | (no equivalent)                                     | CollectionTitle                                 |
 * | mangaVolume             | (no equivalent)                                     | MangaVolume                                     |
 * | format                  | Format                                              | Series > Format                                 |
 * | language                | LanguageISO                                         | (no equivalent)                                 |
 * | ageRating               | AgeRating                                           | AgeRating                                       |
 * | communityRating(Count)  | CommunityRating                                     | CommunityRating > AverageRating / RatingCount   |
 * | coverDate               | Year / Month / Day                                  | CoverDate (YYYY-MM-DD)                          |
 * | storeDate               | (no equivalent)                                     | StoreDate (YYYY-MM-DD)                          |
 * | lastModified            | (no equivalent)                                     | LastModified                                    |
 * | genres                  | Genre (comma-separated string)                      | Genres > Genre[] (`id` attribute preserved)     |
 * | tags                    | Tags (comma-separated string)                       | Tags > Tag[] (`id` attribute preserved)         |
 * | characters              | Characters (comma-separated string)                 | Characters > Character[] (`id` attribute)       |
 * | teams                   | Teams (comma-separated string)                      | Teams > Team[] (`id` attribute)                 |
 * | locations               | Locations (comma-separated string)                  | Locations > Location[] (`id` attribute)         |
 * | storyArcs               | StoryArc / StoryArcNumber (parallel comma lists)    | Arcs > Arc[] (Name + Number + `id`)             |
 * | mainCharacterOrTeam     | MainCharacterOrTeam                                 | (no equivalent; dropped)                       |
 * | stories                 | (no equivalent)                                     | Stories > Story[]                               |
 * | reprints                | (no equivalent)                                     | Reprints > Reprint[]                            |
 * | universes               | (no equivalent)                                     | Universes > Universe[]                          |
 * | identifiers             | (no equivalent)                                     | IDS > ID[]                                      |
 * | prices                  | (no equivalent)                                     | Prices > Price[]                                |
 * | credits                 | Writer/Penciller/Inker/Colorist/Letterer/CoverArtist/Editor/Translator (comma-separated per role) | Credits > Credit[] (Creator + Roles > Role[], `id` attributes) |
 * | web                     | Web (single URL)                                    | URLs > URL[] (`primary` attribute)              |
 * | gtin                    | GTIN                                                | GTIN > ISBN                                     |
 * | gtinUpc                 | (no equivalent)                                     | GTIN > UPC                                      |
 * | blackAndWhite           | BlackAndWhite (Yes/No)                              | (no equivalent; ComicInfo-only)                |
 * | manga                   | Manga                                               | (no equivalent; ComicInfo-only)                |
 * | pages                   | Pages > Page[] (Image/Type/DoublePage/... attrs)    | (no equivalent; ComicInfo-only)                |
 */
export const COMIC_INFO_CREDIT_ROLES = [
  'Writer',
  'Penciller',
  'Inker',
  'Colorist',
  'Letterer',
  'CoverArtist',
  'Editor',
  'Translator',
] as const;

export type ComicInfoCreditRole = (typeof COMIC_INFO_CREDIT_ROLES)[number];

/** ComicInfo.xml `YesNo` simple type. */
export const COMIC_INFO_YES_NO_VALUES = ['Unknown', 'No', 'Yes'] as const;

/** ComicInfo.xml `Manga` simple type. */
export const COMIC_INFO_MANGA_VALUES = ['Unknown', 'No', 'Yes', 'YesAndRightToLeft'] as const;

/** ComicInfo.xml `AgeRating` simple type. */
export const COMIC_INFO_AGE_RATING_VALUES = [
  'Unknown',
  'Adults Only 18+',
  'Early Childhood',
  'Everyone',
  'Everyone 10+',
  'G',
  'Kids to Adults',
  'M',
  'MA15+',
  'Mature 17+',
  'PG',
  'R18+',
  'Rating Pending',
  'Teen',
  'X18+',
] as const;

/** ComicInfo.xml `ComicPageType` simple type. */
export const COMIC_INFO_PAGE_TYPE_VALUES = [
  'FrontCover',
  'InnerCover',
  'Roundup',
  'Story',
  'Advertisement',
  'Editorial',
  'Letters',
  'Preview',
  'BackCover',
  'Other',
  'Deleted',
] as const;

/** MetronInfo.xml `formatType` simple type (Series > Format). */
export const METRON_FORMAT_VALUES = [
  'Annual',
  'Digital Chapter',
  'Graphic Novel',
  'Hardcover',
  'Limited Series',
  'Omnibus',
  'One-Shot',
  'Single Issue',
  'Trade Paperback',
] as const;

/** MetronInfo.xml `informationSource` simple type (IDS > ID `source` attribute). */
export const METRON_INFORMATION_SOURCE_VALUES = [
  'AniList',
  'Comic Vine',
  'Grand Comics Database',
  'Kitsu',
  'MangaDex',
  'MangaUpdates',
  'Marvel',
  'Metron',
  'MyAnimeList',
  'League of Comic Geeks',
] as const;

/** MetronInfo.xml `roleValues` simple type (Credits > Credit > Roles > Role). */
export const METRON_ROLE_VALUES = [
  'Writer',
  'Script',
  'Story',
  'Plot',
  'Interviewer',
  'Artist',
  'Penciller',
  'Breakdowns',
  'Illustrator',
  'Layouts',
  'Inker',
  'Embellisher',
  'Finishes',
  'Ink Assists',
  'Colorist',
  'Color Separations',
  'Color Assists',
  'Color Flats',
  'Digital Art Technician',
  'Gray Tone',
  'Letterer',
  'Cover',
  'Editor',
  'Consulting Editor',
  'Assistant Editor',
  'Associate Editor',
  'Group Editor',
  'Senior Editor',
  'Managing Editor',
  'Collection Editor',
  'Production',
  'Designer',
  'Logo Design',
  'Translator',
  'Supervising Editor',
  'Executive Editor',
  'Editor In Chief',
  'President',
  'Publisher',
  'Chief Creative Officer',
  'Executive Producer',
  'Other',
] as const;

/** MetronInfo.xml `ageRatingType` simple type. */
export const METRON_AGE_RATING_VALUES = ['Unknown', 'Everyone', 'Teen', 'Teen Plus', 'Mature', 'Explicit', 'Adult'] as const;

export function splitCommaList(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

export function joinCommaList(values?: string[]): string | undefined {
  return values && values.length ? values.join(', ') : undefined;
}

/** Extracts the plain text value from a resource that may carry a MetronInfo `id` attribute. */
export function resourceName(item: string | MetronResource): string {
  return typeof item === 'string' ? item : item.name;
}

/** Extracts the MetronInfo `id` attribute from a resource, if any. */
export function resourceId(item: string | MetronResource): string | undefined {
  return typeof item === 'string' ? undefined : item.id;
}

export function joinResourceNames(values?: (string | MetronResource)[]): string | undefined {
  return joinCommaList(values?.map(resourceName));
}
