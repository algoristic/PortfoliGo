import { dateTimeToTick, dayStartTick, startOfDay } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY, TICKS_PER_HOUR } from '@app/clock/domain/models/time.model';
import { seriesIds } from '@app/market/domain/series';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { GameState, StartConditions } from './models/game-state.model';
import { startBankingGame, withBooks } from './testing/banking-game';

import { TEST_SEEDS } from '../../../testing/seeds';

// „Demnächst“ (TS §8.1, E-05, AP 5.7) on the test banks: home bank `b1` charges 12,00 € a month
// without a waiver. The query reads the plan; the bank run books the same salary and fee, and the
// living costs vary around the base amount the query shows (US-EK-02).

function at(day: number, month: number, hour = 0, minute = 0): Tick {
  return dateTimeToTick({ year: 2030, month, day, hour, minute });
}

const START: StartConditions = {
  startCapital: 1_000_000,
  netIncome: 250_000,
  livingCosts: 180_000,
};

describe('GameEngine upcoming', () => {
  it('shows salary, base living costs and the account fee that the bank runs then book', () => {
    const { seedKey, world } = miniWorld(TEST_SEEDS.mini);
    const engine = startBankingGame(createGameWorld(seedKey, world), START);
    engine.runUntil(at(22, 4, 10));

    expect(engine.upcoming(14).map(({ kind, tick, amount }) => [kind, tick, amount])).toEqual([
      ['salary', at(30, 4, 6), 250_000],
      ['living-costs', at(1, 5, 6), 180_000],
      ['account-fee', at(1, 5, 6), 1_200],
    ]);

    engine.drainTransactions();
    engine.runUntil(at(1, 5, 6));
    const booked = engine.drainTransactions();
    const amountOf = (type: string): number | undefined =>
      booked.find((transaction) => transaction.type === type)?.postings[0].amount;
    expect(amountOf('salary')).toBe(250_000);
    expect(amountOf('account-fee')).toBe(-1_200);
    expect(amountOf('living-costs')).not.toBeUndefined();
    expect(engine.upcoming(14).map(({ kind }) => kind)).toEqual([]);
  });

  // TS §6.5: the dividend is announced 20 market days before the ex-date, so ten days before it
  // the market state holds the amount; on the ex-day before the open the scheduled opening carries
  // it; after the open the entitlement waits for its payment date. Ex-date and amount are the
  // market's own (the first ex-date of a share after the start), the payout is 3 shares × amount.
  it('shows an announced ex-date of a held share and its payment, then the pending payout', () => {
    const { seedKey, world } = miniWorld(TEST_SEEDS.mini);
    const first = startBankingGame(createGameWorld(seedKey, world), START);
    const start = first.snapshot();
    const monthStarts = first.monthStartsAfter(-1);
    const ids = seriesIds(first.world.context);
    const etfs = new Set(world.etfs.map(({ id }) => id));
    first.runUntil(at(1, 9));
    const exDate = first.drainEvents().flatMap((event) =>
      event.type === 'ex-dividend' && !etfs.has(ids[event.series]) && event.tick > at(1, 5)
        ? [
            {
              instrumentId: ids[event.series],
              tick: event.tick,
              cents: event.cents,
              paymentDay: event.paymentDay,
            },
          ]
        : [],
    )[0];
    if (exDate === undefined) {
      throw new Error('the mini world has no ex-date of a share from May to August');
    }
    const state = withBooks(start, { accounts: [{ kind: 'clearing', bankId: 'b3' }] }) as GameState;
    state.player.positions = [
      {
        depotId: 'dep-3',
        instrumentId: exDate.instrumentId,
        quantity: 3_000_000,
        lots: [{ buyTick: 0, quantity: 3_000_000, cost: 30_000 }],
        realizedGain: 0,
        distributions: 0,
      },
    ];
    const engine = GameEngine.restore(first.world, state, { monthStarts });
    const payment = dayStartTick(exDate.paymentDay) + 6 * TICKS_PER_HOUR;
    const dividends = (): unknown[] =>
      engine
        .upcoming(14)
        .filter(({ kind }) => kind === 'ex-dividend' || kind === 'dividend-payment')
        .map(({ kind, tick, amount, perShare, instrumentId }) => ({
          kind,
          tick,
          amount,
          perShare,
          instrumentId,
        }));

    engine.runUntil(startOfDay(exDate.tick) - 10 * TICKS_PER_DAY);
    expect(dividends()).toEqual([
      {
        kind: 'ex-dividend',
        tick: exDate.tick,
        amount: null,
        perShare: exDate.cents,
        instrumentId: exDate.instrumentId,
      },
      {
        kind: 'dividend-payment',
        tick: payment,
        amount: 3 * exDate.cents,
        perShare: undefined,
        instrumentId: exDate.instrumentId,
      },
    ]);

    engine.runUntil(startOfDay(exDate.tick) + 1);
    expect(dividends().map((event) => (event as { kind: string }).kind)).toEqual([
      'ex-dividend',
      'dividend-payment',
    ]);

    engine.runUntil(exDate.tick);
    expect(dividends()).toEqual([
      {
        kind: 'dividend-payment',
        tick: payment,
        amount: 3 * exDate.cents,
        perShare: undefined,
        instrumentId: exDate.instrumentId,
      },
    ]);
  });
});
