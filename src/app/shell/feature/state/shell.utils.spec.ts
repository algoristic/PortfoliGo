import fc from 'fast-check';

import { navPathFromUrl } from './shell.utils';

// Router URLs of the game area are `/game/:playerId/<area>/…` (TS §11.4). The generated URLs are
// built from known parts, so the expected area is known without the function under test.
const arbSegment = fc.stringMatching(/^[A-Za-z0-9._~%-]{1,12}$/);
const arbSubPath = fc
  .array(arbSegment, { maxLength: 3 })
  .map((segments) => segments.map((segment) => `/${segment}`).join(''));
const arbQuery = fc.option(
  fc.webQueryParameters().map((query) => `?${query}`),
  { nil: '' },
);
const arbFragment = fc.option(
  fc.webFragments().map((fragment) => `#${fragment}`),
  { nil: '' },
);

describe('navPathFromUrl', () => {
  it('returns the area segment of a game URL', () => {
    expect(navPathFromUrl('/game/preview/settings')).toBe('settings');
  });

  it('returns the area segment of any game URL with sub-pages, query params or a fragment', () => {
    fc.assert(
      fc.property(
        arbSegment,
        arbSegment,
        arbSubPath,
        arbQuery,
        arbFragment,
        (playerId, area, subPath, query, fragment) => {
          expect(navPathFromUrl(`/game/${playerId}/${area}${subPath}${query}${fragment}`)).toBe(
            area,
          );
        },
      ),
    );
  });

  it('returns null for a game URL without an area segment', () => {
    fc.assert(
      fc.property(
        arbSegment,
        fc.constantFrom('', '/'),
        arbQuery,
        arbFragment,
        (playerId, slash, query, fragment) => {
          expect(navPathFromUrl(`/game/${playerId}${slash}${query}${fragment}`)).toBeNull();
        },
      ),
    );
  });

  it('returns null when the URL is outside the game area', () => {
    fc.assert(
      fc.property(
        arbSegment.filter((segment) => segment !== 'game'),
        arbSubPath,
        arbQuery,
        (first, subPath, query) => {
          expect(navPathFromUrl(`/${first}${subPath}${query}`)).toBeNull();
        },
      ),
    );
    expect(navPathFromUrl('/players/new')).toBeNull();
    expect(navPathFromUrl('')).toBeNull();
    expect(navPathFromUrl(undefined)).toBeNull();
  });
});
