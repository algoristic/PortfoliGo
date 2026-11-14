import fc from 'fast-check';

import { normalizeSearchText, rankSearch, SearchFields, searchScore } from './search-ranking';

const ENTRIES: Record<string, SearchFields> = {
  A: { label: 'Übersicht' },
  B: { label: 'Märkte' },
  C: { label: 'Konten & Banken', keywords: ['Girokonto', 'Tagesgeld'] },
  D: { label: 'Alpha Motoren AG', keywords: ['ALPM', 'DE000A1B2C34'] },
  F: { label: 'Spielpause' },
  E: { label: 'Pause' },
};
const IDS = Object.keys(ENTRIES);

function ranked(query: string): string[] {
  return rankSearch(IDS, query, (id) => ENTRIES[id], 10);
}

describe('search-ranking', () => {
  describe('rankSearch', () => {
    // TS §11.4 „Befehlspalette“: example table of the ranking
    it.each<[string, string[]]>([
      ['', ['A', 'B', 'C', 'D', 'F', 'E']],
      ['   ', ['A', 'B', 'C', 'D', 'F', 'E']],
      ['markte', ['B']],
      ['MÄRK', ['B']],
      ['bank', ['C']],
      ['konto', ['C']],
      ['alpm', ['D']],
      ['de000a1b2c34', ['D']],
      ['mtrn', ['D']],
      ['amag', []],
      ['pa', ['E', 'F']],
      ['pause', ['E', 'F']],
      ['mrkt', ['B']],
      ['alpha ag', ['D']],
      ['en', ['C', 'D']],
      ['zz', []],
      ['alpha zz', []],
    ])('ranks %j as %j', (query, expected) => {
      expect(ranked(query)).toEqual(expected);
    });

    it('stops at the limit', () => {
      expect(rankSearch(IDS, '', (id) => ENTRIES[id], 2)).toEqual(['A', 'B']);
    });

    it('returns only entries that every query word matches, each once', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 6 }), (query) => {
          const result = ranked(query);
          expect(new Set(result).size).toBe(result.length);
          for (const id of result) {
            expect(searchScore(ENTRIES[id], query)).not.toBeNull();
          }
          for (const id of IDS.filter((candidate) => !result.includes(candidate))) {
            expect(searchScore(ENTRIES[id], query)).toBeNull();
          }
        }),
      );
    });
  });

  describe('searchScore', () => {
    // Tiers: whole word 5, label start 4, word start 3, contained 2, letters in order 1
    it.each<[string, SearchFields, number | null]>([
      ['depot', { label: 'Depot' }, 5],
      ['depot', { label: 'Depotgebühr' }, 4],
      ['geb', { label: 'Depotgebühr' }, 2],
      ['gebuhr', { label: 'Depot Gebühr' }, 5],
      ['geb', { label: 'Depot Gebühr' }, 3],
      ['sap', { label: 'Software', keywords: ['SAP'] }, 5],
      ['sa', { label: 'Software', keywords: ['SAP'] }, 3],
      ['ap', { label: 'Software', keywords: ['SAP'] }, 2],
      ['swr', { label: 'Software' }, 1],
      ['rws', { label: 'Software' }, null],
      ['ss', { label: 'Software' }, null],
      ['was', { label: 'Depot' }, null],
      ['', { label: 'Depot' }, 0],
      ['  ', { label: 'Depot', keywords: [''] }, 0],
      ['strasse', { label: 'Straße' }, 5],
      ['depot konto', { label: 'Depot', keywords: ['Verrechnungskonto'] }, 7],
    ])('scores %j against %j with %j', (query, fields, expected) => {
      expect(searchScore(fields, query)).toBe(expected);
    });
  });

  describe('normalizeSearchText', () => {
    it.each([
      ['Märkte', 'markte'],
      ['  Konten   &  Banken ', 'konten & banken'],
      ['Straße', 'strasse'],
      ['ÉLAN', 'elan'],
    ])('normalizes %j to %j', (text, expected) => {
      expect(normalizeSearchText(text)).toBe(expected);
    });
  });
});
