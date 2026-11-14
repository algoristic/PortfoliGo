import { createFeatureSelector, createSelector } from '@ngrx/store';

import { SessionStatus } from '@app/engine/domain/models/session.model';

import { ProgressInfo } from './session.model';
import { SESSION_FEATURE_KEY, SessionState } from './session.reducer';

const selectState = createFeatureSelector<SessionState>(SESSION_FEATURE_KEY);

export const selectPlayerId = createSelector(selectState, (state) => state.playerId);
export const selectPlayerName = createSelector(selectState, (state) => state.playerName);
export const selectPlayerSeed = createSelector(selectState, (state) => state.playerSeed);
export const selectPhase = createSelector(selectState, (state) => state.phase);
export const selectProgress = createSelector(selectState, (state) => state.progress);
export const selectWarning = createSelector(selectState, (state) => state.warning);

/** A catch-up shows as `catching-up` while loading, after loading and after a restart. */
export const selectStatus = createSelector(
  selectPhase,
  selectProgress,
  (phase, progress): SessionStatus => {
    switch (phase) {
      case 'loading':
      case 'restarting':
      case 'loaded':
        if (progress['catch-up'] !== undefined) {
          return 'catching-up';
        }
        return phase === 'loaded' ? 'ready' : phase;
      default:
        return phase;
    }
  },
);

/** Share of the steps done, `null` while the total is not known (0) or nothing runs. */
function ratio(progress: ProgressInfo | undefined): number | null {
  if (progress === undefined || progress.total <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, progress.done / progress.total));
}

export const selectCatchUpRatio = createSelector(selectProgress, (progress) =>
  ratio(progress['catch-up']),
);
export const selectJumpRatio = createSelector(selectProgress, (progress) => ratio(progress.jump));
export const selectCandlesRatio = createSelector(selectProgress, (progress) =>
  ratio(progress.candles),
);
