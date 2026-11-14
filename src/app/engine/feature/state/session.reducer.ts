import { Action, createReducer, on } from '@ngrx/store';

import * as PlayersActions from '@app/players/feature/state/players.actions';

import * as SessionActions from './session.actions';
import { ProgressInfo } from './session.model';
import { isEngineCommandError } from './session.utils';

import { EngineWarningCode, ProgressKind } from '../../data-access/service/engine-service.model';

export const SESSION_FEATURE_KEY = 'session';

/**
 * `loaded` once the engine answered `loadPlayer` (or, after a restart of the worker, finished the
 * `init` again); whether a catch-up still runs follows from `progress`.
 */
export type SessionPhase =
  'idle' | 'loading' | 'restarting' | 'loaded' | 'locked' | 'outdated' | 'failed';

export interface SessionState {
  playerId: string | null;
  playerName: string | null;
  /** Seed of the open player, shown and copied on the settings page (PS US-SP-03). */
  playerSeed: string | null;
  phase: SessionPhase;
  /** Running progress per kind; finished and cancelled runs are removed. */
  progress: Partial<Record<ProgressKind, ProgressInfo>>;
  warning: EngineWarningCode | null;
  error?: unknown;
}

export const initialSessionState: SessionState = {
  playerId: null,
  playerName: null,
  playerSeed: null,
  phase: 'idle',
  progress: {},
  warning: null,
};

const reducer = createReducer(
  initialSessionState,
  on(SessionActions.enterGame, (_state, { profile }) => ({
    ...initialSessionState,
    playerId: profile.id,
    playerName: profile.name,
    playerSeed: profile.seed,
    phase: 'loading' as const,
  })),
  // Renamed on the settings page (or in another place): the header and the export use the new name.
  on(PlayersActions.renamePlayerSuccess, (state, { profile }) =>
    profile.id === state.playerId ? { ...state, playerName: profile.name } : state,
  ),
  on(SessionActions.leaveGame, () => initialSessionState),
  // A late reply of a previous load (the player was left in the meantime) changes nothing.
  on(SessionActions.loadPlayerSuccess, (state, { loaded }) =>
    state.phase === 'loading' && loaded.playerId === state.playerId
      ? { ...state, phase: 'loaded' as const }
      : state,
  ),
  on(SessionActions.loadPlayerFailure, (state, { error }) =>
    state.phase === 'loading'
      ? { ...state, phase: failedPhase(error), progress: {}, error }
      : state,
  ),
  on(SessionActions.retrievedProgress, (state, { progress }) => {
    const { kind, state: runState, done, total } = progress;
    // `init` starts every load: what other runs reported before belongs to the previous one.
    const base = kind === 'init' && runState === 'running' ? {} : state.progress;
    const others = Object.fromEntries(
      Object.entries(base).filter(([other]) => other !== kind),
    ) as SessionState['progress'];
    return {
      ...state,
      progress: runState === 'running' ? { ...others, [kind]: { done, total } } : others,
      phase:
        state.phase === 'restarting' && kind === 'init' && runState === 'done'
          ? ('loaded' as const)
          : state.phase,
    };
  }),
  on(SessionActions.receivedWarning, (state, { warning }) => ({ ...state, warning: warning.code })),
  on(SessionActions.receivedFatal, (state, { fatal }) => {
    if (!fatal.restarting) {
      return { ...state, phase: 'failed' as const, progress: {}, error: fatal.message };
    }
    // The service loads the player again; a load that failed with the worker is retried too.
    const running = state.phase === 'loading' || state.phase === 'loaded';
    const failedWithWorker =
      state.phase === 'failed' && isEngineCommandError(state.error, 'worker-failed');
    return running || failedWithWorker
      ? { ...state, phase: 'restarting' as const, progress: {} }
      : state;
  }),
);

export function sessionReducer(state: SessionState | undefined, action: Action): SessionState {
  return reducer(state, action);
}

function failedPhase(error: unknown): SessionPhase {
  if (isEngineCommandError(error, 'player-locked')) {
    return 'locked';
  }
  return isEngineCommandError(error, 'player-outdated') ? 'outdated' : 'failed';
}
