import * as PwaActions from './pwa.actions';
import { initialPwaState, pwaReducer, PwaState } from './pwa.reducer';

describe('pwaReducer', () => {
  describe('receivedAppUpdate', () => {
    it('keeps a broken version over a later new one, so the reload stays a plain reload', () => {
      const broken = pwaReducer(
        initialPwaState,
        PwaActions.receivedAppUpdate({ event: 'unrecoverable' }),
      );
      expect(
        pwaReducer(broken, PwaActions.receivedAppUpdate({ event: 'version-ready' })).update,
      ).toBe('unrecoverable');
    });

    it('turns a new version into a broken one', () => {
      const ready = pwaReducer(
        initialPwaState,
        PwaActions.receivedAppUpdate({ event: 'version-ready' }),
      );
      expect(
        pwaReducer(ready, PwaActions.receivedAppUpdate({ event: 'unrecoverable' })).update,
      ).toBe('unrecoverable');
    });
  });

  describe('installPromptSuccess', () => {
    const installing: PwaState = { ...initialPwaState, installing: true };

    it('counts an accepted dialog as installed', () => {
      const state = pwaReducer(
        installing,
        PwaActions.installPromptSuccess({ outcome: 'accepted' }),
      );
      expect(state).toMatchObject({ installed: true, installing: false });
    });

    it('stays uninstalled after a dismissed dialog', () => {
      const state = pwaReducer(
        installing,
        PwaActions.installPromptSuccess({ outcome: 'dismissed' }),
      );
      expect(state).toMatchObject({ installed: false, installing: false });
    });
  });
});
