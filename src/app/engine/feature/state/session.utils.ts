import { Tick } from '@app/clock/domain/models/time.model';

import { LastTicks } from './session.model';

import {
  EngineCommandError,
  EngineServiceErrorCode,
} from '../../data-access/service/engine.service';

export function isEngineCommandError(
  error: unknown,
  code?: EngineServiceErrorCode,
): error is EngineCommandError {
  return error instanceof EngineCommandError && (code === undefined || error.code === code);
}

function isTick(value: unknown): value is Tick {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Valid entries of a stored `pgo.lastTick`; anything else in localStorage is dropped. */
export function validLastTicks(data: unknown): LastTicks {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(data).filter((entry): entry is [string, Tick] => isTick(entry[1])),
  );
}

export function lastTickOf(data: unknown, playerId: string): Tick | undefined {
  const ticks = validLastTicks(data);
  return Object.hasOwn(ticks, playerId) ? ticks[playerId] : undefined;
}

export function withLastTick(data: unknown, playerId: string, tick: Tick): LastTicks {
  return { ...validLastTicks(data), [playerId]: tick };
}
