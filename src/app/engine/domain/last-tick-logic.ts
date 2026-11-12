import { Tick } from '@app/clock/domain/models/time.model';

import { LastTicks } from './models/last-tick.model';

function isTick(value: unknown): value is Tick {
  return Number.isSafeInteger(value) && (value as number) >= 0;
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

/** The valid entries without the player's, e.g. after deleting the player. */
export function withoutLastTick(data: unknown, playerId: string): LastTicks {
  return Object.fromEntries(Object.entries(validLastTicks(data)).filter(([id]) => id !== playerId));
}
