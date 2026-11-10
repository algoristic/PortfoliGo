import { navPathFromUrl } from './shell.utils';

describe('navPathFromUrl', () => {
  it('returns the area segment of a game URL', () => {
    expect(navPathFromUrl('/game/preview/settings')).toBe('settings');
  });

  it('returns the area segment when the URL has sub-pages, query params or a fragment', () => {
    expect(navPathFromUrl('/game/preview/markets/abc')).toBe('markets');
    expect(navPathFromUrl('/game/preview/orders?status=open')).toBe('orders');
    expect(navPathFromUrl('/game/preview/taxes#2026')).toBe('taxes');
  });

  it('returns null when the URL has no area segment', () => {
    expect(navPathFromUrl('/game/preview')).toBeNull();
    expect(navPathFromUrl('/game/preview?x=1')).toBeNull();
  });

  it('returns null when the URL is outside the game area or missing', () => {
    expect(navPathFromUrl('/players/new')).toBeNull();
    expect(navPathFromUrl('')).toBeNull();
    expect(navPathFromUrl(undefined)).toBeNull();
  });
});
