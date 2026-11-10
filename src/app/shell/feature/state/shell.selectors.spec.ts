import * as ShellSelectors from './shell.selectors';

describe('ShellSelectors', () => {
  describe('selectActiveNavPath', () => {
    it('returns the area of the current game URL', () => {
      expect(ShellSelectors.selectActiveNavPath.projector('/game/preview/settings')).toBe(
        'settings',
      );
    });

    it('returns null when the URL is outside the game area', () => {
      expect(ShellSelectors.selectActiveNavPath.projector('/players')).toBeNull();
    });
  });
});
