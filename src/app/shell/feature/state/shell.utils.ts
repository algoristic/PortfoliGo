/** Returns the area segment of a game URL (`/game/:playerId/<area>/…`), or `null` outside of an area. */
export function navPathFromUrl(url: string | undefined): string | null {
  const path = (url ?? '').split(/[?#]/)[0];
  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments[0] !== 'game') {
    return null;
  }
  return segments[2] ?? null;
}
