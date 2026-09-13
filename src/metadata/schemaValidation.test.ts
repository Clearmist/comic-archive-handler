import { describe, it, expect } from 'vitest';
import { metadataToComicInfoXml } from './comicInfo.js';
import { metadataToMetronInfoXml } from './metronInfo.js';
import { validateMetadataXml } from './validate.js';
import type { ComicMetadata, MetadataSchema } from '../types.js';

async function expectValidAgainst(xml: string, schema: MetadataSchema) {
  const result = await validateMetadataXml(xml, schema);
  expect(result.issues.map((issue) => issue.message)).toEqual([]);
  expect(result.valid).toBe(true);
}

describe('ComicInfo.xml schema validation', () => {
  it('validates a minimal document', async () => {
    await expectValidAgainst(metadataToComicInfoXml({ title: 'Minimal' }), 'ComicInfo');
  });

  it('validates a fully-populated document against the bundled XSD', async () => {
    const metadata: ComicMetadata = {
      title: 'The Amazing Test',
      series: 'Test Series',
      number: '1',
      count: 12,
      volume: '2024',
      alternateSeries: 'Test Series (Alternate Cover)',
      alternateNumber: '1AU',
      alternateCount: 1,
      summary: 'A test summary.',
      notes: 'Some notes.',
      coverDate: { year: 2024, month: 3, day: 15 },
      publisher: 'Test Publisher',
      imprint: 'Test Imprint',
      genres: ['Action', 'Adventure'],
      tags: ['indie', 'variant'],
      web: ['https://example.com/comic'],
      pageCount: 22,
      language: 'en',
      format: 'Limited Series',
      blackAndWhite: true,
      manga: 'Yes',
      characters: ['Hero', 'Sidekick'],
      teams: ['The Team'],
      locations: ['Metropolis'],
      scanInformation: 'Scanned by Test',
      storyArcs: [{ name: 'Big Arc', number: 1 }],
      seriesGroup: 'Crossover Event',
      ageRating: 'Teen',
      communityRating: 4.5,
      mainCharacterOrTeam: 'Hero',
      review: 'Great issue.',
      gtin: '9781234567897',
      credits: [
        { name: 'Alice Writer', role: 'Writer' },
        { name: 'Bob Penciller', role: 'Penciller' },
        { name: 'Cy Translator', role: 'Translator' },
      ],
      pages: [
        { index: 0, type: 'FrontCover' },
        { index: 1, doublePage: true, imageSize: 12345, imageWidth: 1000, imageHeight: 1500, key: 'k', bookmark: 'b' },
      ],
    };
    await expectValidAgainst(metadataToComicInfoXml(metadata), 'ComicInfo');
  });
});

describe('MetronInfo.xml schema validation', () => {
  it('validates a minimal document (Series is required)', async () => {
    await expectValidAgainst(metadataToMetronInfoXml({ series: 'Minimal Series' }), 'MetronInfo');
  });

  it('validates a fully-populated document against the bundled XSD', async () => {
    const metadata: ComicMetadata = {
      identifiers: [{ source: 'Metron', value: '12345', primary: true }],
      publisher: 'Test Publisher',
      publisherId: 'pub-1',
      imprint: 'Test Imprint',
      imprintId: 'imp-1',
      series: 'Test Series',
      seriesSort: 'Test Series',
      seriesId: 'series-1',
      seriesLang: 'en',
      volume: '1',
      format: 'Single Issue',
      seriesStartYear: 2024,
      seriesIssueCount: 12,
      seriesVolumeCount: 1,
      seriesAlternativeNames: [{ name: 'Alt Name', lang: 'fr', id: 'alt-1' }],
      mangaVolume: 'Vol. 1',
      collectionTitle: 'Collected Edition',
      number: '1',
      alternateNumber: '1AU',
      stories: [{ name: 'Story One', id: 'story-1' }, 'Story Two'],
      summary: 'A test summary.',
      prices: [{ amount: 3.99, country: 'US' }],
      coverDate: { year: 2024, month: 3, day: 15 },
      storeDate: { year: 2024, month: 2, day: 20 },
      pageCount: 22,
      notes: 'Some notes.',
      genres: [{ name: 'Action', id: 'genre-1' }, 'Adventure'],
      tags: ['indie'],
      storyArcs: [{ name: 'Big Arc', number: 1, id: 'arc-1' }],
      characters: [{ name: 'Hero', id: 'char-1' }],
      teams: [{ name: 'The Team', id: 'team-1' }],
      universes: [{ name: 'Earth-1', designation: 'Primary', id: 'universe-1' }],
      locations: [{ name: 'Metropolis', id: 'loc-1' }],
      reprints: [{ name: 'Issue #0', id: 'reprint-1' }],
      gtin: '9781234567897',
      gtinUpc: '012345678905',
      ageRating: 'Teen',
      communityRating: 4.5,
      communityRatingCount: 100,
      web: [{ url: 'https://example.com/comic', primary: true }, 'https://example.com/alt'],
      credits: [
        { name: 'Alice Writer', role: 'Writer', creatorId: 'creator-1', roleId: 'role-1' },
        { name: 'Bob Penciller', role: 'Penciller' },
      ],
      lastModified: '2024-03-15T12:00:00Z',
    };
    await expectValidAgainst(metadataToMetronInfoXml(metadata), 'MetronInfo');
  });
});

describe('validateMetadataXml', () => {
  it('reports issues for a document that violates the schema', async () => {
    const result = await validateMetadataXml('<ComicInfo><NotARealField>x</NotARealField></ComicInfo>', 'ComicInfo');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.message).toContain('NotARealField');
  });

  it('accepts a Buffer', async () => {
    const result = await validateMetadataXml(Buffer.from(metadataToComicInfoXml({ title: 'Buffered' })), 'ComicInfo');
    expect(result.valid).toBe(true);
  });
});
