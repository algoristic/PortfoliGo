import { PlayerProfile } from '@app/players/domain/models/player.model';

import * as SessionActions from './session.actions';
import { initialSessionState, sessionReducer, SessionState } from './session.reducer';

import { ProgressPayload } from '../../data-access/service/engine-service.model';
import { EngineCommandError } from '../../data-access/service/engine.service';

const PROFILE = { id: 'p-a', name: 'Anna' } as PlayerProfile;

function reduce(...actions: Parameters<typeof sessionReducer>[1][]): SessionState {
  return actions.reduce<SessionState>(
    (state, action) => sessionReducer(state, action),
    initialSessionState,
  );
}

function progress(
  kind: ProgressPayload['kind'],
  state: ProgressPayload['state'],
  done = 0,
  total = 1,
): ReturnType<typeof SessionActions.retrievedProgress> {
  return SessionActions.retrievedProgress({ progress: { kind, state, done, total } });
}

const entered = SessionActions.enterGame({ profile: PROFILE });
const loaded = SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 0 } });

describe('sessionReducer', () => {
  describe('loadPlayerSuccess', () => {
    it('ignores the late reply of a player that was left or replaced', () => {
      expect(reduce(entered, SessionActions.leaveGame(), loaded).phase).toBe('idle');
      const other = SessionActions.enterGame({ profile: { ...PROFILE, id: 'p-b' } });
      expect(reduce(other, loaded).phase).toBe('loading');
    });
  });

  describe('loadPlayerFailure', () => {
    it.each([
      ['player-locked', 'locked'],
      ['player-outdated', 'outdated'],
      ['storage-failed', 'failed'],
      ['internal-error', 'failed'],
    ] as const)('maps %s to the phase %s', (code, phase) => {
      const failure = SessionActions.loadPlayerFailure({ error: new EngineCommandError(code) });
      expect(reduce(entered, failure).phase).toBe(phase);
    });

    it('fails on errors that are no engine errors', () => {
      const failure = SessionActions.loadPlayerFailure({ error: new Error('boom') });
      expect(reduce(entered, failure).phase).toBe('failed');
    });
  });

  describe('retrievedProgress', () => {
    it('keeps running runs and drops finished ones', () => {
      const state = reduce(
        entered,
        progress('init', 'running'),
        progress('catch-up', 'running', 0, 120),
        progress('candles', 'running', 3, 10),
        progress('catch-up', 'running', 60, 120),
      );
      expect(state.progress).toEqual({
        init: { done: 0, total: 1 },
        'catch-up': { done: 60, total: 120 },
        candles: { done: 3, total: 10 },
      });
      expect(
        reduce(entered, progress('jump', 'running'), progress('jump', 'cancelled')).progress,
      ).toEqual({});
    });

    it('starts over with every init, dropping what an earlier load reported', () => {
      const state = reduce(
        entered,
        progress('candles', 'running', 3, 10),
        progress('init', 'running'),
      );
      expect(state.progress).toEqual({ init: { done: 0, total: 1 } });
    });
  });

  describe('receivedFatal', () => {
    it('restarts a loaded game and is loaded again after the next init', () => {
      const fatal = SessionActions.receivedFatal({ fatal: { message: 'x', restarting: true } });
      const restarting = reduce(entered, loaded, progress('catch-up', 'running', 1, 2), fatal);
      expect(restarting.phase).toBe('restarting');
      expect(restarting.progress).toEqual({});
      expect(sessionReducer(restarting, progress('init', 'done')).phase).toBe('loaded');
    });

    it('retries a load that failed with the worker', () => {
      const failure = SessionActions.loadPlayerFailure({
        error: new EngineCommandError('worker-failed'),
      });
      const fatal = SessionActions.receivedFatal({ fatal: { message: 'x', restarting: true } });
      expect(reduce(entered, failure, fatal).phase).toBe('restarting');
    });

    it('keeps a locked session when the worker restarts', () => {
      const locked = SessionActions.loadPlayerFailure({
        error: new EngineCommandError('player-locked'),
      });
      const fatal = SessionActions.receivedFatal({ fatal: { message: 'x', restarting: true } });
      expect(reduce(entered, locked, fatal).phase).toBe('locked');
    });

    it('fails when the service gives up', () => {
      const fatal = SessionActions.receivedFatal({ fatal: { message: 'x', restarting: false } });
      expect(reduce(entered, loaded, fatal).phase).toBe('failed');
    });
  });
});
