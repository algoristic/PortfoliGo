import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick, tickToDateTime } from '@app/clock/domain/calendar-logic';
import { Cents } from '@app/shared/domain/models/money.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { StartConditions } from './models/game-state.model';
import { startBankingGame, withBooks, withTestBanks } from './testing/banking-game';

import { TEST_SEEDS } from '../../../testing/seeds';

// Long run against an independent reference (AP 7.3b, 7.1c-11): three years from the game start
// over the year ends 2030–2032 and the leap day 29.02.2032. Savings accounts at the test banks
// (2 % act/365; `b1` pays monthly, `b2` quarterly, TS §7.3, §7.4) and the capital income tax with
// the saver's allowance (TS §7.7). The reference walks the calendar with `Date.UTC`, keeps the
// end-of-day balances, accrues their interest per day, credits it on the first weekday of the
// month at 06:00 (bank holidays only come with stage 2) and withholds 25 % above 1.000 € per
// calendar year of the booking.

const START: StartConditions = {
  startCapital: 1_000_000,
  netIncome: 250_000,
  livingCosts: 180_000,
};
const RATE = 0.02;
const ALLOWANCE = 100_000;
const DAY_MS = 86_400_000;

interface Booking {
  date: string;
  type: string;
  account: string;
  amount: Cents;
  params?: Transaction['params'];
}

interface ReferenceAccount {
  id: string;
  quarterly: boolean;
  balance: Cents;
  /** Interest of the running month, then of the months waiting for their payout. */
  running: number;
  pending: number;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** First Monday–Friday of the month: the first bank working day without holidays. */
function isFirstWeekday(ms: number): boolean {
  const date = new Date(ms);
  const weekday = date.getUTCDay();
  return weekday >= 1 && weekday <= 5 && date.getUTCDate() <= (weekday === 1 ? 3 : 1);
}

function reference(accounts: ReferenceAccount[], fromMs: number, untilMs: number): Booking[] {
  const bookings: Booking[] = [];
  let taxYear = 0;
  let income = 0;
  let withheld = 0;
  for (let ms = fromMs; ms <= untilMs; ms += DAY_MS) {
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    if (isFirstWeekday(ms)) {
      for (const account of accounts) {
        if (account.quarterly && (month - 1) % 3 !== 0) {
          continue;
        }
        const amount = Math.round(account.pending);
        account.pending = 0;
        if (amount <= 0) {
          continue;
        }
        const last = new Date(Date.UTC(year, month - 2, 1));
        const first = new Date(Date.UTC(year, month - (account.quarterly ? 4 : 2), 1));
        account.balance += amount;
        bookings.push({
          date: isoDate(ms),
          type: 'credit-interest',
          account: account.id,
          amount,
          params: {
            from: monthKeyOf(first.getUTCFullYear(), first.getUTCMonth() + 1),
            to: monthKeyOf(last.getUTCFullYear(), last.getUTCMonth() + 1),
          },
        });
        if (year !== taxYear) {
          taxYear = year;
          income = 0;
          withheld = 0;
        }
        income += amount;
        const due = Math.round(0.25 * Math.max(0, income - ALLOWANCE));
        if (due !== withheld) {
          account.balance -= due - withheld;
          bookings.push({
            date: isoDate(ms),
            type: 'tax',
            account: account.id,
            amount: withheld - due,
          });
          withheld = due;
        }
      }
    }
    if (ms === untilMs) {
      break;
    }
    for (const account of accounts) {
      account.running += (account.balance * RATE) / 365;
    }
    if (new Date(ms + DAY_MS).getUTCDate() === 1) {
      for (const account of accounts) {
        account.pending += account.running;
        account.running = 0;
      }
    }
  }
  return bookings;
}

describe('GameEngine over several years', () => {
  describe('US-BK-08, US-ST-02: interest and tax from 2030 to 2033 with the leap day 2032', () => {
    it('credits and taxes savings interest like a reference from the daily balances', () => {
      const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
      const world = createGameWorld(seedKey, mini);
      const started = startBankingGame(world, START);
      const snapshot = withBooks(started.snapshot(), {
        accounts: [
          { kind: 'savings', bankId: 'b1', balance: 10_000_000 },
          { kind: 'savings', bankId: 'b2', balance: 5_000_000 },
        ],
      });
      const engine = GameEngine.restore(withTestBanks(world), snapshot, {
        monthStarts: started.monthStartsAfter(-1),
      });
      const until = dateTimeToTick({ year: 2033, month: 4, day: 1, hour: 7 });
      engine.runUntil(until);

      const booked: Booking[] = engine
        .drainTransactions()
        .filter(({ type }) => ['credit-interest', 'tax', 'tax-refund'].includes(type))
        .filter(({ postings }) => ['acc-2', 'acc-3'].includes(postings[0].account))
        .map(({ tick, type, postings, params }) => {
          const { year, month, day } = tickToDateTime(tick);
          const date = isoDate(Date.UTC(year, month - 1, day));
          const base = { date, type, account: postings[0].account, amount: postings[0].amount };
          return type === 'credit-interest' ? { ...base, params } : base;
        });
      const accounts: ReferenceAccount[] = [
        { id: 'acc-2', quarterly: false, balance: 10_000_000, running: 0, pending: 0 },
        { id: 'acc-3', quarterly: true, balance: 5_000_000, running: 0, pending: 0 },
      ];
      const expected = reference(accounts, Date.UTC(2030, 3, 1), Date.UTC(2033, 3, 1));

      expect(booked).toEqual(expected);
      // 36 monthly and 12 quarterly credits, the one for February 2032 over 29 days.
      expect(expected.filter(({ type }) => type === 'credit-interest')).toHaveLength(48);
      expect(expected.some(({ params }) => params?.['to'] === '2032-02')).toBe(true);
      // The allowance is used up in each calendar year, so every year withholds tax.
      const taxYears = new Set(
        expected.filter(({ type }) => type === 'tax').map(({ date }) => date.slice(0, 4)),
      );
      expect([...taxYears]).toEqual(['2030', '2031', '2032', '2033']);
      expect(engine.player.balances.get('acc-2')).toBe(accounts[0].balance);
      expect(engine.player.balances.get('acc-3')).toBe(accounts[1].balance);
    });
  });
});
