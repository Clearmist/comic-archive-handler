import { describe, it, expect } from 'vitest';
import { metadataToComicInfoXml, comicInfoXmlToMetadata } from './comicInfo.js';
import type { ComicMetadata } from '../types.js';

describe('ComicInfo.xml conversion', () => {
  const metadata: ComicMetadata = {
    title: 'The Amazing Test',
    series: 'Test Series',
    number: '1',
    volume: '2024',
    summary: 'A test summary.',
    coverDate: { year: 2024, month: 3, day: 15 },
    publisher: 'Test Publisher',
    genres: ['Action', 'Adventure'],
    characters: ['Hero', 'Sidekick'],
    credits: [
      { name: 'Alice Writer', role: 'Writer' },
      { name: 'Bob Penciller', role: 'Penciller' },
    ],
    blackAndWhite: true,
    ageRating: 'Teen',
    pages: [{ index: 0, type: 'FrontCover' }, { index: 1 }],
  };

  it('round-trips through XML', () => {
    const xml = metadataToComicInfoXml(metadata);

    expect(xml).toContain('<ComicInfo>');
    expect(xml).toContain('<Title>The Amazing Test</Title>');

    const parsed = comicInfoXmlToMetadata(xml);

    expect(parsed.title).toBe(metadata.title);
    expect(parsed.series).toBe(metadata.series);
    expect(parsed.number).toBe(metadata.number);
    expect(parsed.coverDate).toEqual(metadata.coverDate);
    expect(parsed.genres).toEqual(metadata.genres);
    expect(parsed.characters).toEqual(metadata.characters);
    expect(parsed.blackAndWhite).toBe(true);
    expect(parsed.credits).toEqual(expect.arrayContaining(metadata.credits ?? []));
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.pages?.[0]?.type).toBe('FrontCover');
  });

  it('keeps a single Page as an array, not a collapsed object', () => {
    const xml = metadataToComicInfoXml({ pages: [{ index: 0 }] });
    const parsed = comicInfoXmlToMetadata(xml);

    expect(Array.isArray(parsed.pages)).toBe(true);
    expect(parsed.pages).toHaveLength(1);
  });

  it('drops MetronInfo-only fields (lossy by design)', () => {
    const xml = metadataToComicInfoXml({ seriesSort: 'Amazing Test, The', seriesId: 'series-1' });

    expect(xml).not.toContain('SortName');
    expect(xml).not.toContain('series-1');
  });

  it('writes Tags as a comma-separated string (added in ComicInfo v2.1)', () => {
    const xml = metadataToComicInfoXml({ tags: ['tag1', 'tag2'] });

    expect(xml).toContain('<Tags>tag1, tag2</Tags>');
    expect(comicInfoXmlToMetadata(xml).tags).toEqual(['tag1', 'tag2']);
  });
});
