import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import type { ComicMetadata, ComicCredit, ComicPage, ComicStoryArc } from '../types.js';
import { COMIC_INFO_CREDIT_ROLES, splitCommaList, joinCommaList, joinResourceNames } from './schema.js';

const PARSE_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name: string) => name === 'Page',
};

const BUILD_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressEmptyNode: true,
  suppressBooleanAttributes: false,
};

const KNOWN_KEYS = new Set<string>([
  'Title',
  'Series',
  'Number',
  'Count',
  'Volume',
  'AlternateSeries',
  'AlternateNumber',
  'AlternateCount',
  'Summary',
  'Notes',
  'Year',
  'Month',
  'Day',
  'Publisher',
  'Imprint',
  'Genre',
  'Tags',
  'Web',
  'PageCount',
  'LanguageISO',
  'Format',
  'BlackAndWhite',
  'Manga',
  'Characters',
  'Teams',
  'Locations',
  'ScanInformation',
  'StoryArc',
  'StoryArcNumber',
  'SeriesGroup',
  'AgeRating',
  'Pages',
  'CommunityRating',
  'MainCharacterOrTeam',
  'Review',
  'GTIN',
  ...COMIC_INFO_CREDIT_ROLES,
]);

export function metadataToComicInfoXml(metadata: ComicMetadata): string {
  const root: Record<string, unknown> = {};

  if (metadata.title !== undefined) {
    root.Title = metadata.title;
  }

  if (metadata.series !== undefined) {
    root.Series = metadata.series;
  }

  if (metadata.number !== undefined) {
    root.Number = metadata.number;
  }

  if (metadata.count !== undefined) {
    root.Count = metadata.count;
  }

  if (metadata.volume !== undefined) {
    root.Volume = metadata.volume;
  }

  if (metadata.alternateSeries !== undefined) {
    root.AlternateSeries = metadata.alternateSeries;
  }

  if (metadata.alternateNumber !== undefined) {
    root.AlternateNumber = metadata.alternateNumber;
  }

  if (metadata.alternateCount !== undefined) {
    root.AlternateCount = metadata.alternateCount;
  }

  if (metadata.summary !== undefined) {
    root.Summary = metadata.summary;
  }

  if (metadata.notes !== undefined) {
    root.Notes = metadata.notes;
  }

  if (metadata.coverDate?.year !== undefined) {
    root.Year = metadata.coverDate.year;
  }

  if (metadata.coverDate?.month !== undefined) {
    root.Month = metadata.coverDate.month;
  }

  if (metadata.coverDate?.day !== undefined) {
    root.Day = metadata.coverDate.day;
  }

  // The ComicInfo schema declares its elements as an ordered xs:sequence, so
  // these must be assigned to `root` in the exact order the XSD lists them.
  for (const role of COMIC_INFO_CREDIT_ROLES) {
    const names = (metadata.credits ?? []).filter((credit) => credit.role === role).map((credit) => credit.name);
    const joined = joinCommaList(names);
    if (joined) {
      root[role] = joined;
    }
  }

  if (metadata.publisher !== undefined) {
    root.Publisher = metadata.publisher;
  }

  if (metadata.imprint !== undefined) {
    root.Imprint = metadata.imprint;
  }

  const genres = joinResourceNames(metadata.genres);

  if (genres) {
    root.Genre = genres;
  }

  const tags = joinResourceNames(metadata.tags);

  if (tags) {
    root.Tags = tags;
  }

  const web = metadata.web?.[0];

  if (web !== undefined) {
    root.Web = typeof web === 'string' ? web : web.url;
  }

  if (metadata.pageCount !== undefined) {
    root.PageCount = metadata.pageCount;
  }

  if (metadata.language !== undefined) {
    root.LanguageISO = metadata.language;
  }

  if (metadata.format !== undefined) {
    root.Format = metadata.format;
  }

  if (metadata.blackAndWhite !== undefined) {
    root.BlackAndWhite = metadata.blackAndWhite ? 'Yes' : 'No';
  }

  if (metadata.manga !== undefined) {
    root.Manga = metadata.manga;
  }

  const characters = joinResourceNames(metadata.characters);

  if (characters) {
    root.Characters = characters;
  }

  const teams = joinResourceNames(metadata.teams);

  if (teams) {
    root.Teams = teams;
  }

  const locations = joinResourceNames(metadata.locations);

  if (locations) {
    root.Locations = locations;
  }

  if (metadata.scanInformation !== undefined) {
    root.ScanInformation = metadata.scanInformation;
  }

  const storyArcs = joinCommaList(metadata.storyArcs?.map((arc) => arc.name));

  if (storyArcs) {
    root.StoryArc = storyArcs;
  }

  if (metadata.storyArcs?.some((arc) => arc.number !== undefined)) {
    root.StoryArcNumber = metadata.storyArcs.map((arc) => arc.number ?? '').join(', ');
  }

  if (metadata.seriesGroup !== undefined) {
    root.SeriesGroup = metadata.seriesGroup;
  }

  if (metadata.ageRating !== undefined) {
    root.AgeRating = metadata.ageRating;
  }

  if (metadata.pages?.length) {
    root.Pages = {
      Page: metadata.pages.map((page) => {
        const attrs: Record<string, unknown> = { '@_Image': page.index };

        if (page.type !== undefined) {
          attrs['@_Type'] = page.type;
        }

        if (page.doublePage !== undefined) {
          attrs['@_DoublePage'] = page.doublePage;
        }

        if (page.imageSize !== undefined) {
          attrs['@_ImageSize'] = page.imageSize;
        }

        if (page.imageWidth !== undefined) {
          attrs['@_ImageWidth'] = page.imageWidth;
        }

        if (page.imageHeight !== undefined) {
          attrs['@_ImageHeight'] = page.imageHeight;
        }

        if (page.key !== undefined) {
          attrs['@_Key'] = page.key;
        }

        if (page.bookmark !== undefined) {
          attrs['@_Bookmark'] = page.bookmark;
        }

        return attrs;
      }),
    };
  }

  if (metadata.communityRating !== undefined) {
    root.CommunityRating = metadata.communityRating;
  }

  if (metadata.mainCharacterOrTeam !== undefined) {
    root.MainCharacterOrTeam = metadata.mainCharacterOrTeam;
  }

  if (metadata.review !== undefined) {
    root.Review = metadata.review;
  }

  if (metadata.gtin !== undefined) {
    root.GTIN = metadata.gtin;
  }

  if (metadata.comicInfoExtra) {
    Object.assign(root, metadata.comicInfoExtra);
  }

  const builder = new XMLBuilder(BUILD_OPTIONS);
  const body = builder.build({ ComicInfo: root }) as string;

  return `<?xml version="1.0" encoding="utf-8"?>\n${body}`;
}

export function comicInfoXmlToMetadata(xml: string | Buffer): ComicMetadata {
  const parser = new XMLParser(PARSE_OPTIONS);
  const parsed = parser.parse(xml.toString('utf8')) as { ComicInfo?: Record<string, unknown> };
  const root = parsed.ComicInfo ?? {};
  const metadata: ComicMetadata = {};

  if (root.Title !== undefined) {
    metadata.title = String(root.Title);
  }

  if (root.Series !== undefined) {
    metadata.series = String(root.Series);
  }

  if (root.Number !== undefined) {
    metadata.number = String(root.Number);
  }

  if (root.Count !== undefined) {
    metadata.count = Number(root.Count);
  }

  if (root.Volume !== undefined) {
    metadata.volume = String(root.Volume);
  }

  if (root.AlternateSeries !== undefined) {
    metadata.alternateSeries = String(root.AlternateSeries);
  }

  if (root.AlternateNumber !== undefined) {
    metadata.alternateNumber = String(root.AlternateNumber);
  }

  if (root.AlternateCount !== undefined) {
    metadata.alternateCount = Number(root.AlternateCount);
  }

  if (root.Summary !== undefined) {
    metadata.summary = String(root.Summary);
  }

  if (root.Notes !== undefined) {
    metadata.notes = String(root.Notes);
  }

  if (root.Year !== undefined || root.Month !== undefined || root.Day !== undefined) {
    metadata.coverDate = {
      year: root.Year !== undefined ? Number(root.Year) : undefined,
      month: root.Month !== undefined ? Number(root.Month) : undefined,
      day: root.Day !== undefined ? Number(root.Day) : undefined,
    };
  }

  if (root.Publisher !== undefined) {
    metadata.publisher = String(root.Publisher);
  }

  if (root.Imprint !== undefined) {
    metadata.imprint = String(root.Imprint);
  }

  if (root.Genre !== undefined) {
    metadata.genres = splitCommaList(String(root.Genre));
  }

  if (root.Tags !== undefined) {
    metadata.tags = splitCommaList(String(root.Tags));
  }

  if (root.Web !== undefined) {
    metadata.web = [String(root.Web)];
  }

  if (root.PageCount !== undefined) {
    metadata.pageCount = Number(root.PageCount);
  }

  if (root.LanguageISO !== undefined) {
    metadata.language = String(root.LanguageISO);
  }

  if (root.Format !== undefined) {
    metadata.format = String(root.Format);
  }

  if (root.BlackAndWhite !== undefined) {
    metadata.blackAndWhite = String(root.BlackAndWhite).toLowerCase() === 'yes';
  }

  if (root.Manga !== undefined) {
    metadata.manga = String(root.Manga);
  }

  if (root.Characters !== undefined) {
    metadata.characters = splitCommaList(String(root.Characters));
  }

  if (root.Teams !== undefined) {
    metadata.teams = splitCommaList(String(root.Teams));
  }

  if (root.Locations !== undefined) {
    metadata.locations = splitCommaList(String(root.Locations));
  }

  if (root.ScanInformation !== undefined) {
    metadata.scanInformation = String(root.ScanInformation);
  }

  if (root.StoryArc !== undefined) {
    const names = splitCommaList(String(root.StoryArc)) ?? [];
    const numbers =
      root.StoryArcNumber !== undefined
        ? String(root.StoryArcNumber)
            .split(',')
            .map((part) => part.trim())
        : [];

    metadata.storyArcs = names.map((name, i): ComicStoryArc => ({
      name,
      number: numbers[i] ? Number(numbers[i]) : undefined,
    }));
  }

  if (root.SeriesGroup !== undefined) {
    metadata.seriesGroup = String(root.SeriesGroup);
  }

  if (root.AgeRating !== undefined) {
    metadata.ageRating = String(root.AgeRating);
  }

  if (root.CommunityRating !== undefined) {
    metadata.communityRating = Number(root.CommunityRating);
  }

  if (root.MainCharacterOrTeam !== undefined) {
    metadata.mainCharacterOrTeam = String(root.MainCharacterOrTeam);
  }

  if (root.Review !== undefined) {
    metadata.review = String(root.Review);
  }

  if (root.GTIN !== undefined) {
    metadata.gtin = String(root.GTIN);
  }

  const credits: ComicCredit[] = [];

  for (const role of COMIC_INFO_CREDIT_ROLES) {
    const value = root[role];

    if (value !== undefined) {
      for (const name of splitCommaList(String(value)) ?? []) {
        credits.push({ name, role });
      }
    }
  }

  if (credits.length) {
    metadata.credits = credits;
  }

  const pagesNode = root.Pages as { Page?: Array<Record<string, unknown>> } | undefined;

  if (pagesNode?.Page?.length) {
    metadata.pages = pagesNode.Page.map((page): ComicPage => ({
      index: Number(page['@_Image'] ?? 0),
      type: page['@_Type'] !== undefined ? String(page['@_Type']) : undefined,
      doublePage: page['@_DoublePage'] !== undefined ? String(page['@_DoublePage']) === 'true' : undefined,
      imageSize: page['@_ImageSize'] !== undefined ? Number(page['@_ImageSize']) : undefined,
      imageWidth: page['@_ImageWidth'] !== undefined ? Number(page['@_ImageWidth']) : undefined,
      imageHeight: page['@_ImageHeight'] !== undefined ? Number(page['@_ImageHeight']) : undefined,
      key: page['@_Key'] !== undefined ? String(page['@_Key']) : undefined,
      bookmark: page['@_Bookmark'] !== undefined ? String(page['@_Bookmark']) : undefined,
    }));
  }

  const extra: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(root)) {
    if (!KNOWN_KEYS.has(key)) {
      extra[key] = value;
    }
  }

  if (Object.keys(extra).length) {
    metadata.comicInfoExtra = extra;
  }

  return metadata;
}
