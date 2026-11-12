import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { BackgroundMode } from './game-state.model';

/**
 * Events of the engine: codes with parameters, never texts (TS §8.6). They never contain prices
 * after their tick (TS §4.5, rule 7). Series are indices as in `market/domain/series.ts`.
 */
export type EngineEvent =
  | {
      type: 'dividend-announced';
      tick: Tick;
      series: number;
      cents: Cents;
      exDay: number;
    }
  | { type: 'session-opened'; tick: Tick; exchangeId: string }
  | { type: 'ex-dividend'; tick: Tick; series: number; cents: Cents; paymentDay: number }
  | {
      type: 'session-closed';
      tick: Tick;
      exchangeId: string;
      /** Trading day that ended; its daily candles of `series` are final now (TS §6.8). */
      day: number;
      series: readonly number[];
    }
  | { type: 'month-ended'; tick: Tick; year: number; month: number }
  | { type: 'year-ended'; tick: Tick; year: number }
  | { type: 'background-mode-changed'; tick: Tick; mode: BackgroundMode };

export type EngineEventType = EngineEvent['type'];
