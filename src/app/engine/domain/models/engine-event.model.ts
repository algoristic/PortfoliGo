import { AccountId } from '@app/banking/domain/models/account.model';
import { AccountEventCode } from '@app/banking/domain/models/household.model';
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
  | { type: 'background-mode-changed'; tick: Tick; mode: BackgroundMode }
  | {
      /** A balance or limit change uncovered the account or exceeded its limit (TS §7.4). */
      type: AccountEventCode;
      tick: Tick;
      accountId: AccountId;
      balance: Cents;
      /** Overdraft limit; `null` for accounts without overdraft facility. */
      limit: Cents | null;
    }
  | {
      /** Credit interest was booked; `tax` is the tax booked right after it (refunds negative). */
      type: 'interest-credited';
      tick: Tick;
      accountId: AccountId;
      amount: Cents;
      tax: Cents;
    };

export type EngineEventType = EngineEvent['type'];
