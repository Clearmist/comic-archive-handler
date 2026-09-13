import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import type {
  ComicMetadata,
  ComicCredit,
  ComicStoryArc,
  ComicDate,
  MetronResource,
  ComicAlternativeName,
  ComicUniverse,
  ComicPrice,
  ComicUrl,
  ComicIdentifier,
} from '../types.js';
import { resourceName, resourceId } from './schema.js';

const REPEATING_ELEMENTS = new Set([
  'ID',
  'Genre',
  'Tag',
  'Character',
  'Team',
  'Universe',
  'Location',
  'Reprint',
  'Arc',
  'Credit',
  'Role',
  'URL',
  'Story',
  'Price',
  'AlternativeName',
]);

const PARSE_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name: string) => REPEATING_ELEMENTS.has(name),
};

const BUILD_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressEmptyNode: true,
  suppressBooleanAttributes: false,
};

const KNOWN_ROOT_KEYS = new Set([
  'IDS',
  'Publisher',
  'Series',
  'MangaVolume',
  'CollectionTitle',
  'Number',
  'AlternativeNumber',
  'Stories',
  'Summary',
  'Prices',
  'CoverDate',
  'StoreDate',
  'PageCount',
  'Notes',
  'Genres',
  'Tags',
  'Arcs',
  'Characters',
  'Teams',
  'Universes',
  'Locations',
  'Reprints',
  'GTIN',
  'AgeRating',
  'CommunityRating',
  'URLs',
  'Credits',
  'LastModified',
]);

function formatDate(date?: ComicDate): string | undefined {
  if (!date || date.year === undefined) {
    return undefined;
  }

  const month = String(date.month ?? 1).padStart(2, '0');
  const day = String(date.day ?? 1).padStart(2, '0');

  return `${date.year}-${month}-${day}`;
}

function parseDate(value?: unknown): ComicDate | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return undefined;
  }

  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Builds a MetronInfo `resourceType` node: plain text, or `{ #text, @_id }` when an id is present. */
function buildResourceItem(item: string | MetronResource): unknown {
  const id = resourceId(item);

  return id !== undefined ? { '#text': resourceName(item), '@_id': id } : resourceName(item);
}

/** Parses a MetronInfo `resourceType` node back into a plain string or `MetronResource`. */
function parseResourceItem(item: unknown): string | MetronResource {
  if (item !== null && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    const id = obj['@_id'];
    const text = String(obj['#text'] ?? '');

    return id !== undefined ? { name: text, id: String(id) } : text;
  }

  return String(item);
}

function buildUrlItem(item: string | ComicUrl): unknown {
  if (typeof item === 'string') {
    return item;
  }

  return item.primary !== undefined ? { '#text': item.url, '@_primary': item.primary } : item.url;
}

function parseUrlItem(item: unknown): string | ComicUrl {
  if (item !== null && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    const primary = obj['@_primary'];
    const text = String(obj['#text'] ?? '');

    return primary !== undefined ? { url: text, primary: String(primary) === 'true' } : text;
  }

  return String(item);
}

function buildIdentifierItem(id: ComicIdentifier): unknown {
  return {
    '#text': id.value,
    '@_source': id.source,
    ...(id.primary !== undefined ? { '@_primary': id.primary } : {}),
  };
}

function parseIdentifierItem(item: unknown): ComicIdentifier {
  const obj = (item ?? {}) as Record<string, unknown>;

  return {
    source: String(obj['@_source'] ?? ''),
    value: String(obj['#text'] ?? ''),
    primary: obj['@_primary'] !== undefined ? String(obj['@_primary']) === 'true' : undefined,
  };
}

function buildAlternativeNameItem(item: ComicAlternativeName): unknown {
  const attrs: Record<string, unknown> = {};

  if (item.id !== undefined) {
    attrs['@_id'] = item.id;
  }

  if (item.lang !== undefined) {
    attrs['@_lang'] = item.lang;
  }

  return Object.keys(attrs).length ? { '#text': item.name, ...attrs } : item.name;
}

function parseAlternativeNameItem(item: unknown): ComicAlternativeName {
  if (item === null || typeof item !== 'object') {
    return { name: String(item) };
  }

  const obj = item as Record<string, unknown>;

  return {
    name: String(obj['#text'] ?? ''),
    id: obj['@_id'] !== undefined ? String(obj['@_id']) : undefined,
    lang: obj['@_lang'] !== undefined ? String(obj['@_lang']) : undefined,
  };
}

function buildUniverseItem(universe: ComicUniverse): unknown {
  return {
    Name: universe.name,
    ...(universe.designation !== undefined ? { Designation: universe.designation } : {}),
    ...(universe.id !== undefined ? { '@_id': universe.id } : {}),
  };
}

function parseUniverseItem(item: Record<string, unknown>): ComicUniverse {
  return {
    name: String(item.Name ?? ''),
    designation: item.Designation !== undefined ? String(item.Designation) : undefined,
    id: item['@_id'] !== undefined ? String(item['@_id']) : undefined,
  };
}

function buildArcItem(arc: ComicStoryArc): unknown {
  return {
    Name: arc.name,
    ...(arc.number !== undefined ? { Number: arc.number } : {}),
    ...(arc.id !== undefined ? { '@_id': arc.id } : {}),
  };
}

function parseArcItem(item: Record<string, unknown>): ComicStoryArc {
  return {
    name: String(item.Name ?? ''),
    number: item.Number !== undefined ? Number(item.Number) : undefined,
    id: item['@_id'] !== undefined ? String(item['@_id']) : undefined,
  };
}

function buildPriceItem(price: ComicPrice): unknown {
  return { '#text': price.amount, '@_country': price.country };
}

function parsePriceItem(item: unknown): ComicPrice {
  const obj = (item ?? {}) as Record<string, unknown>;

  return { amount: Number(obj['#text']), country: String(obj['@_country'] ?? '') };
}

export function metadataToMetronInfoXml(metadata: ComicMetadata): string {
  const root: Record<string, unknown> = {};

  if (metadata.identifiers?.length) {
    root.IDS = { ID: metadata.identifiers.map(buildIdentifierItem) };
  }

  if (metadata.publisher !== undefined || metadata.imprint !== undefined || metadata.publisherId !== undefined) {
    root.Publisher = {
      ...(metadata.publisher !== undefined ? { Name: metadata.publisher } : {}),
      ...(metadata.imprint !== undefined
        ? {
            Imprint: buildResourceItem(
              metadata.imprintId !== undefined ? { name: metadata.imprint, id: metadata.imprintId } : metadata.imprint,
            ),
          }
        : {}),
      ...(metadata.publisherId !== undefined ? { '@_id': metadata.publisherId } : {}),
    };
  }

  if (
    metadata.series !== undefined ||
    metadata.seriesSort !== undefined ||
    metadata.volume !== undefined ||
    metadata.format !== undefined ||
    metadata.seriesStartYear !== undefined ||
    metadata.seriesIssueCount !== undefined ||
    metadata.seriesVolumeCount !== undefined ||
    metadata.seriesAlternativeNames?.length ||
    metadata.seriesId !== undefined ||
    metadata.seriesLang !== undefined
  ) {
    root.Series = {
      ...(metadata.series !== undefined ? { Name: metadata.series } : {}),
      ...(metadata.seriesSort !== undefined ? { SortName: metadata.seriesSort } : {}),
      ...(metadata.volume !== undefined ? { Volume: metadata.volume } : {}),
      ...(metadata.format !== undefined ? { Format: metadata.format } : {}),
      ...(metadata.seriesStartYear !== undefined ? { StartYear: metadata.seriesStartYear } : {}),
      ...(metadata.seriesIssueCount !== undefined ? { IssueCount: metadata.seriesIssueCount } : {}),
      ...(metadata.seriesVolumeCount !== undefined ? { VolumeCount: metadata.seriesVolumeCount } : {}),
      ...(metadata.seriesAlternativeNames?.length
        ? { AlternativeNames: { AlternativeName: metadata.seriesAlternativeNames.map(buildAlternativeNameItem) } }
        : {}),
      ...(metadata.seriesId !== undefined ? { '@_id': metadata.seriesId } : {}),
      ...(metadata.seriesLang !== undefined ? { '@_lang': metadata.seriesLang } : {}),
    };
  }

  if (metadata.mangaVolume !== undefined) {
    root.MangaVolume = metadata.mangaVolume;
  }

  if (metadata.collectionTitle !== undefined) {
    root.CollectionTitle = metadata.collectionTitle;
  }

  if (metadata.number !== undefined) {
    root.Number = metadata.number;
  }

  if (metadata.alternateNumber !== undefined) {
    root.AlternativeNumber = metadata.alternateNumber;
  }

  if (metadata.stories?.length) {
    root.Stories = { Story: metadata.stories.map(buildResourceItem) };
  }

  if (metadata.summary !== undefined) {
    root.Summary = metadata.summary;
  }

  if (metadata.prices?.length) {
    root.Prices = { Price: metadata.prices.map(buildPriceItem) };
  }

  const coverDate = formatDate(metadata.coverDate);

  if (coverDate) {
    root.CoverDate = coverDate;
  }

  const storeDate = formatDate(metadata.storeDate);

  if (storeDate) {
    root.StoreDate = storeDate;
  }

  if (metadata.pageCount !== undefined) {
    root.PageCount = metadata.pageCount;
  }

  if (metadata.notes !== undefined) {
    root.Notes = metadata.notes;
  }

  if (metadata.genres?.length) {
    root.Genres = { Genre: metadata.genres.map(buildResourceItem) };
  }

  if (metadata.tags?.length) {
    root.Tags = { Tag: metadata.tags.map(buildResourceItem) };
  }

  if (metadata.storyArcs?.length) {
    root.Arcs = { Arc: metadata.storyArcs.map(buildArcItem) };
  }

  if (metadata.characters?.length) {
    root.Characters = { Character: metadata.characters.map(buildResourceItem) };
  }

  if (metadata.teams?.length) {
    root.Teams = { Team: metadata.teams.map(buildResourceItem) };
  }

  if (metadata.universes?.length) {
    root.Universes = { Universe: metadata.universes.map(buildUniverseItem) };
  }

  if (metadata.locations?.length) {
    root.Locations = { Location: metadata.locations.map(buildResourceItem) };
  }

  if (metadata.reprints?.length) {
    root.Reprints = { Reprint: metadata.reprints.map(buildResourceItem) };
  }

  if (metadata.gtin !== undefined || metadata.gtinUpc !== undefined) {
    root.GTIN = {
      ...(metadata.gtin !== undefined ? { ISBN: metadata.gtin } : {}),
      ...(metadata.gtinUpc !== undefined ? { UPC: metadata.gtinUpc } : {}),
    };
  }

  if (metadata.ageRating !== undefined) {
    root.AgeRating = metadata.ageRating;
  }

  if (metadata.communityRating !== undefined) {
    root.CommunityRating = {
      AverageRating: metadata.communityRating,
      ...(metadata.communityRatingCount !== undefined ? { RatingCount: metadata.communityRatingCount } : {}),
    };
  }

  if (metadata.web?.length) {
    root.URLs = { URL: metadata.web.map(buildUrlItem) };
  }

  if (metadata.credits?.length) {
    root.Credits = {
      Credit: metadata.credits.map((credit) => ({
        Creator: buildResourceItem(credit.creatorId !== undefined ? { name: credit.name, id: credit.creatorId } : credit.name),
        Roles: { Role: [buildResourceItem(credit.roleId !== undefined ? { name: credit.role, id: credit.roleId } : credit.role)] },
      })),
    };
  }

  if (metadata.lastModified !== undefined) {
    root.LastModified = metadata.lastModified;
  }

  if (metadata.metronInfoExtra) {
    Object.assign(root, metadata.metronInfoExtra);
  }

  const builder = new XMLBuilder(BUILD_OPTIONS);
  const body = builder.build({ MetronInfo: root }) as string;

  return `<?xml version="1.0" encoding="utf-8"?>\n${body}`;
}

export function metronInfoXmlToMetadata(xml: string | Buffer): ComicMetadata {
  const parser = new XMLParser(PARSE_OPTIONS);
  const parsed = parser.parse(xml.toString('utf8')) as { MetronInfo?: Record<string, unknown> };
  const root = parsed.MetronInfo ?? {};
  const metadata: ComicMetadata = {};

  const ids = root.IDS as { ID?: unknown[] } | undefined;

  if (ids?.ID?.length) {
    metadata.identifiers = ids.ID.map(parseIdentifierItem);
  }

  const publisher = root.Publisher as { Name?: unknown; Imprint?: unknown; '@_id'?: unknown } | undefined;

  if (publisher?.Name !== undefined) {
    metadata.publisher = String(publisher.Name);
  }

  if (publisher?.Imprint !== undefined) {
    const imprint = parseResourceItem(publisher.Imprint);
    metadata.imprint = resourceName(imprint);
    metadata.imprintId = resourceId(imprint);
  }

  if (publisher?.['@_id'] !== undefined) {
    metadata.publisherId = String(publisher['@_id']);
  }

  const series = root.Series as
    | {
        Name?: unknown;
        SortName?: unknown;
        Volume?: unknown;
        Format?: unknown;
        StartYear?: unknown;
        IssueCount?: unknown;
        VolumeCount?: unknown;
        AlternativeNames?: { AlternativeName?: unknown[] };
        '@_id'?: unknown;
        '@_lang'?: unknown;
      }
    | undefined;

  if (series?.Name !== undefined) {
    metadata.series = String(series.Name);
  }

  if (series?.SortName !== undefined) {
    metadata.seriesSort = String(series.SortName);
  }

  if (series?.Volume !== undefined) {
    metadata.volume = String(series.Volume);
  }

  if (series?.Format !== undefined) {
    metadata.format = String(series.Format);
  }

  if (series?.StartYear !== undefined) {
    metadata.seriesStartYear = Number(series.StartYear);
  }

  if (series?.IssueCount !== undefined) {
    metadata.seriesIssueCount = Number(series.IssueCount);
  }

  if (series?.VolumeCount !== undefined) {
    metadata.seriesVolumeCount = Number(series.VolumeCount);
  }

  if (series?.AlternativeNames?.AlternativeName?.length) {
    metadata.seriesAlternativeNames = series.AlternativeNames.AlternativeName.map(parseAlternativeNameItem);
  }

  if (series?.['@_id'] !== undefined) {
    metadata.seriesId = String(series['@_id']);
  }

  if (series?.['@_lang'] !== undefined) {
    metadata.seriesLang = String(series['@_lang']);
  }

  if (root.MangaVolume !== undefined) {
    metadata.mangaVolume = String(root.MangaVolume);
  }

  if (root.CollectionTitle !== undefined) {
    metadata.collectionTitle = String(root.CollectionTitle);
  }

  if (root.Number !== undefined) {
    metadata.number = String(root.Number);
  }

  if (root.AlternativeNumber !== undefined) {
    metadata.alternateNumber = String(root.AlternativeNumber);
  }

  const stories = root.Stories as { Story?: unknown[] } | undefined;

  if (stories?.Story?.length) {
    metadata.stories = stories.Story.map(parseResourceItem);
  }

  if (root.Summary !== undefined) {
    metadata.summary = String(root.Summary);
  }

  const prices = root.Prices as { Price?: unknown[] } | undefined;

  if (prices?.Price?.length) {
    metadata.prices = prices.Price.map(parsePriceItem);
  }

  metadata.coverDate = parseDate(root.CoverDate);
  metadata.storeDate = parseDate(root.StoreDate);

  if (root.PageCount !== undefined) {
    metadata.pageCount = Number(root.PageCount);
  }

  if (root.Notes !== undefined) {
    metadata.notes = String(root.Notes);
  }

  const genres = root.Genres as { Genre?: unknown[] } | undefined;

  if (genres?.Genre?.length) {
    metadata.genres = genres.Genre.map(parseResourceItem);
  }

  const tags = root.Tags as { Tag?: unknown[] } | undefined;

  if (tags?.Tag?.length) {
    metadata.tags = tags.Tag.map(parseResourceItem);
  }

  const arcs = root.Arcs as { Arc?: Record<string, unknown>[] } | undefined;

  if (arcs?.Arc?.length) {
    metadata.storyArcs = arcs.Arc.map(parseArcItem);
  }

  const characters = root.Characters as { Character?: unknown[] } | undefined;

  if (characters?.Character?.length) {
    metadata.characters = characters.Character.map(parseResourceItem);
  }

  const teams = root.Teams as { Team?: unknown[] } | undefined;

  if (teams?.Team?.length) {
    metadata.teams = teams.Team.map(parseResourceItem);
  }

  const universes = root.Universes as { Universe?: Record<string, unknown>[] } | undefined;

  if (universes?.Universe?.length) {
    metadata.universes = universes.Universe.map(parseUniverseItem);
  }

  const locations = root.Locations as { Location?: unknown[] } | undefined;

  if (locations?.Location?.length) {
    metadata.locations = locations.Location.map(parseResourceItem);
  }

  const reprints = root.Reprints as { Reprint?: unknown[] } | undefined;

  if (reprints?.Reprint?.length) {
    metadata.reprints = reprints.Reprint.map(parseResourceItem);
  }

  const gtin = root.GTIN as { ISBN?: unknown; UPC?: unknown } | undefined;

  if (gtin?.ISBN !== undefined) {
    metadata.gtin = String(gtin.ISBN);
  }

  if (gtin?.UPC !== undefined) {
    metadata.gtinUpc = String(gtin.UPC);
  }

  if (root.AgeRating !== undefined) {
    metadata.ageRating = String(root.AgeRating);
  }

  const communityRating = root.CommunityRating as { AverageRating?: unknown; RatingCount?: unknown } | undefined;

  if (communityRating?.AverageRating !== undefined) {
    metadata.communityRating = Number(communityRating.AverageRating);
  }

  if (communityRating?.RatingCount !== undefined) {
    metadata.communityRatingCount = Number(communityRating.RatingCount);
  }

  const urls = root.URLs as { URL?: unknown[] } | undefined;

  if (urls?.URL?.length) {
    metadata.web = urls.URL.map(parseUrlItem);
  }

  const credits = root.Credits as { Credit?: Array<{ Creator?: unknown; Roles?: { Role?: unknown[] } }> } | undefined;

  if (credits?.Credit?.length) {
    const list: ComicCredit[] = [];

    for (const credit of credits.Credit) {
      const creator = parseResourceItem(credit.Creator ?? '');
      const name = resourceName(creator);
      const creatorId = resourceId(creator);
      const roleItems = credit.Roles?.Role?.length ? credit.Roles.Role : ['Unknown'];

      for (const roleItem of roleItems) {
        const role = parseResourceItem(roleItem);

        list.push({ name, role: resourceName(role), creatorId, roleId: resourceId(role) });
      }
    }

    metadata.credits = list;
  }

  if (root.LastModified !== undefined) {
    metadata.lastModified = String(root.LastModified);
  }

  const extra: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(root)) {
    if (!KNOWN_ROOT_KEYS.has(key)) {
      extra[key] = value;
    }
  }

  if (Object.keys(extra).length) {
    metadata.metronInfoExtra = extra;
  }

  return metadata;
}
