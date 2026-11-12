import { Tick } from '@app/clock/domain/models/time.model';

/** `pgo.lastTick` (TS §9.3): tick of the last `clock` event per player, saved at `pagehide`. */
export type LastTicks = Record<string, Tick>;

export const LAST_TICK_VERSION = 1;
