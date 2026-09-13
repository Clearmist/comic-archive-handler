import { describe, it, expect } from 'vitest';
import { metadataToMetronInfoXml, metronInfoXmlToMetadata } from './metronInfo.js';
import type { ComicMetadata } from '../types.js';

describe('MetronInfo.xml conversion', () => {
  const metadata: ComicMetadata = {
    series: 'Test Series',
    seriesSort: 'Test Series',
    volume: '1',
    number: '1',
    summary: 'A test summary.',
    coverDate: { year: 2024, month: 3, day: 15 },
    storeDate: { year: 2024, month: 2, day: 20 },
    publisher: 'Test Publisher',
    genres: ['Action'],
    tags: ['indie'],
    characters: ['Hero'],
    storyArcs: [{ name: 'Big Arc', number: 1 }],
    credits: [{ name: 'Alice Writer', role: 'Writer' }],
    ageRating: 'Teen',
    web: ['https://example.com/comic'],
  };

  it('round-trips through XML', () => {
    const xml = metadataToMetronInfoXml(metadata);

    expect(xml).toContain('<MetronInfo>');

    const parsed = metronInfoXmlToMetadata(xml);

    expect(parsed.series).toBe(metadata.series);
    expect(parsed.seriesSort).toBe(metadata.seriesSort);
    expect(parsed.volume).toBe(metadata.volume);
    expect(parsed.coverDate).toEqual(metadata.coverDate);
    expect(parsed.storeDate).toEqual(metadata.storeDate);
    expect(parsed.genres).toEqual(metadata.genres);
    expect(parsed.tags).toEqual(metadata.tags);
    expect(parsed.storyArcs).toEqual(metadata.storyArcs);
    expect(parsed.credits).toEqual(metadata.credits);
    expect(parsed.web).toEqual(metadata.web);
  });

  it('keeps single repeated elements (Genre, Credit, Role) as arrays', () => {
    const xml = metadataToMetronInfoXml({
      genres: ['Solo Genre'],
      credits: [{ name: 'Solo Creator', role: 'Writer' }],
    });
    const parsed = metronInfoXmlToMetadata(xml);

    expect(Array.isArray(parsed.genres)).toBe(true);
    expect(parsed.genres).toEqual(['Solo Genre']);
    expect(Array.isArray(parsed.credits)).toBe(true);
    expect(parsed.credits).toEqual([{ name: 'Solo Creator', role: 'Writer' }]);
  });

  it('drops ComicInfo-only fields (lossy by design)', () => {
    const xml = metadataToMetronInfoXml({ title: 'Should be dropped', blackAndWhite: true, manga: 'Yes' });

    expect(xml).not.toContain('Should be dropped');
    expect(xml).not.toContain('BlackAndWhite');
    expect(xml).not.toContain('Manga');
  });
});
