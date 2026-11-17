import { AccountId } from '@app/banking/domain/models/account.model';
import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick, dayStartTick } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_HOUR } from '@app/clock/domain/models/time.model';
import { seriesIds } from '@app/market/domain/series';
import { Cents } from '@app/shared/domain/models/money.model';
import { OrderSpec } from '@app/trading/domain/models/order.model';
import { Bank } from '@app/world/domain/models/bank.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { CommandResult, GameCommand } from './models/engine-command.model';
import { GameSnapshot, GameState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { startBankingGame, TEST_BANKS, withBooks } from './testing/banking-game';
import { MINI_START_CONDITIONS } from './testing/mini-game';
import { TestMarket, TestPrice } from './testing/test-market';

import { TEST_SEEDS } from '../../../testing/seeds';

// Positions, lots, payouts and the custody fee in the engine (TS §6.5, §7.3, §7.4, §7.6; US-PF-06,
// US-BK-08) against the test market: every held or traded series at mid 100 € (bid 99,90 €, ask
// 100,10 €, spread 0,2 %). The ex-dates and amounts are the market's own (the first ex-date of a
// share and of a distributing ETF after the start); the test computes the expected payouts from
// them. Banks: `bn` 0,90 € flat per order with fractions, `bc` like `bn` with a custody fee of
// 1 % p. a., `bk` like `bn` with 50 € p. a.; no interest. Every player gets a depot `dep-3` with
// the clearing account `acc-2` at the start (Mo 01.04.2030 00:00).

const SHARE = 1_000_000;
const DEPOT = 'dep-3';
const CLEARING: AccountId = 'acc-2';

function at(month: number, day: number, hour = 0, minute = 0): Tick {
  return dateTimeToTick({ year: 2030, month, day, hour, minute });
}

function broker(id: string, custodyFee: DepotConditions['custodyFee']): Bank {
  return {
    id,
    name: id,
    type: 'online-broker',
    conditions: {
      currentAccount: null,
      savingsAccount: null,
      depot: {
        custodyFee,
        orderFee: { kind: 'flat', amount: 90 },
        exchangeFee: 0,
        savingsPlanFee: { kind: 'free' },
        clearingAccountRate: 0,
        clearingAccountDebitRate: 0,
        venue: 'exchange',
        spreadMarkup: 0,
        fractionalShares: true,
      },
    },
  };
}

const BANKS: readonly Bank[] = [
  ...TEST_BANKS,
  broker('bn', { kind: 'none' }),
  broker('bc', { kind: 'percent-pa', rate: 0.01 }),
  broker('bk', { kind: 'flat-pa', amount: 5_000 }),
];

interface ExDate {
  instrumentId: string;
  series: number;
  tick: Tick;
  cents: Cents;
  paymentTick: Tick;
}

interface Setup {
  bank?: string;
  balance?: Cents;
  /** Shares held at the start, one lot bought at tick 0 for 100 € a share. */
  held?: Readonly<Record<string, number>>;
  /** Shares in a second depot `dep-5` (clearing account `acc-4`) at the same bank. */
  second?: Readonly<Record<string, number>>;
}

type WithoutStamp<T> = T extends unknown ? Omit<T, 'id' | 'tick'> : never;

/**
 * Credit of `shares` shares for a dividend per share in cents with two decimals (TS §6.5, 7.1b-09),
 * rounded half up to whole cents (TS §7.4).
 */
function payout(cents: number, shares: number): number {
  return Math.round((Math.round(cents * 100) * shares) / 100);
}

describe('GameEngine positions, payouts and custody fee', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: ReturnType<GameEngine['monthStartsAfter']>;
  let ids: string[];
  let dividend: ExDate;
  let distribution: ExDate;
  /** Two ex-dates of which the second lies before the first's payment date and pays later. */
  let overlapping: [ExDate, ExDate];
  let commandSeq = 0;

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    const engine = startBankingGame(createGameWorld(seedKey, mini), MINI_START_CONDITIONS);
    world = { ...engine.world, world: { ...engine.world.world, banks: BANKS } };
    start = engine.snapshot();
    monthStarts = engine.monthStartsAfter(-1);
    ids = seriesIds(world.context);
    const etfs = new Set(mini.etfs.map(({ id }) => id));
    engine.runUntil(at(9, 1));
    const exDates = engine.drainEvents().flatMap((event): ExDate[] =>
      event.type === 'ex-dividend'
        ? [
            {
              instrumentId: ids[event.series],
              series: event.series,
              tick: event.tick,
              cents: event.cents,
              paymentTick: dayStartTick(event.paymentDay) + 6 * TICKS_PER_HOUR,
            },
          ]
        : [],
    );
    const share = exDates.find(({ instrumentId }) => !etfs.has(instrumentId));
    const fund = exDates.find(({ instrumentId }) => etfs.has(instrumentId));
    if (share === undefined || fund === undefined) {
      throw new Error('the mini world has no ex-dates in the first months');
    }
    dividend = share;
    distribution = fund;
    const pair = exDates.flatMap((first) =>
      exDates
        .filter(
          (next) =>
            next.instrumentId !== first.instrumentId &&
            next.tick > first.tick &&
            next.tick < first.paymentTick &&
            next.paymentTick > first.paymentTick,
        )
        .map((next): [ExDate, ExDate] => [first, next]),
    )[0];
    if (pair === undefined) {
      throw new Error('the mini world has no overlapping ex-dates in the first months');
    }
    overlapping = pair;
  });

  beforeEach(() => {
    commandSeq = 0;
  });

  function setup({ bank = 'bn', balance = 0, held = {}, second }: Setup = {}): GameEngine {
    const state = withBooks(start, {
      accounts: [
        { kind: 'clearing', bankId: bank, balance },
        ...(second === undefined ? [] : [{ kind: 'clearing' as const, bankId: bank }]),
      ],
    }) as GameState;
    const positions = (depotId: string, shares: Readonly<Record<string, number>>) =>
      Object.entries(shares).map(([instrumentId, quantity]) => ({
        depotId: depotId as typeof DEPOT,
        instrumentId,
        quantity,
        lots: [{ buyTick: 0, quantity, cost: Math.round((quantity / SHARE) * 10_000) }],
        realizedGain: 0,
        distributions: 0,
      }));
    state.player.positions = [...positions(DEPOT, held), ...positions('dep-5', second ?? {})];
    const prices: TestPrice[][] = [];
    for (const id of ids) {
      prices[ids.indexOf(id)] = [{ tick: 0, price: 100 }];
    }
    return GameEngine.restore(world, state, {
      monthStarts,
      prices: () => new TestMarket(prices, 0.002),
    });
  }

  function apply(engine: GameEngine, body: WithoutStamp<GameCommand>): CommandResult {
    commandSeq++;
    return engine.applyCommand({ ...body, id: `c${commandSeq}`, tick: engine.tick } as GameCommand);
  }

  function market(instrumentId: string, side: OrderSpec['side'], quantity: number): OrderSpec {
    return {
      depotId: DEPOT,
      instrumentId,
      side,
      type: 'market',
      size: { kind: 'quantity', quantity },
      limit: null,
      stop: null,
      validity: { kind: 'day' },
    };
  }

  function payouts(journal: readonly Transaction[]): unknown[] {
    return journal
      .filter(({ type }) => type === 'dividend' || type === 'fund-distribution')
      .map(({ tick, type, postings, refs, params }) => ({
        tick,
        type,
        postings: postings.map(({ account, amount }) => [account, amount]),
        refs,
        params,
      }));
  }

  describe('US-PF-06: lots and realized gains', () => {
    it('keeps the purchases as lots and sells them by FIFO with exact costs', () => {
      // At a European open (09:00) on Tuesday: buy 10 and 5 shares at the ask 100,10 €, sell 12 at
      // the bid 99,90 €. TS §7.6: lot 1 costs 1.001,00 + 0,90 = 1.001,90 €, lot 2 500,50 + 0,90 =
      // 501,40 €; the sale takes lot 1 and 2 of 5 shares of lot 2: 1.001,90 + round(501,40 × 2/5)
      // = 1.001,90 + 200,56 = 1.202,46 €; proceeds 12 × 99,90 − 0,90 = 1.197,90 €, realized −4,56 €.
      const engine = setup({ balance: 1_000_000 });
      const instrumentId = ids[0];
      engine.runUntil(at(4, 2, 10));
      const tick = engine.tick;
      expect(
        apply(engine, { type: 'placeOrder', order: market(instrumentId, 'buy', 10 * SHARE) }).ok,
      ).toBe(true);
      expect(
        apply(engine, { type: 'placeOrder', order: market(instrumentId, 'buy', 5 * SHARE) }).ok,
      ).toBe(true);
      expect(engine.player.positions).toEqual([
        {
          depotId: DEPOT,
          instrumentId,
          quantity: 15 * SHARE,
          lots: [
            { buyTick: tick, quantity: 10 * SHARE, cost: 100_190 },
            { buyTick: tick, quantity: 5 * SHARE, cost: 50_140 },
          ],
          realizedGain: 0,
          distributions: 0,
        },
      ]);
      engine.drainTransactions();
      expect(
        apply(engine, { type: 'placeOrder', order: market(instrumentId, 'sell', 12 * SHARE) }).ok,
      ).toBe(true);
      expect(engine.drainTransactions()[0].params).toMatchObject({
        marketValue: 119_880,
        costBasis: 120_246,
        realizedGain: -456,
      });
      expect(engine.player.positions).toEqual([
        {
          depotId: DEPOT,
          instrumentId,
          quantity: 3 * SHARE,
          lots: [{ buyTick: tick, quantity: 3 * SHARE, cost: 30_084 }],
          realizedGain: -456,
          distributions: 0,
        },
      ]);
      // TS §7.9: 3 × 99,90 € at the bid without mark-up; the net worth adds it to the balances.
      expect(engine.securitiesValue()).toBe(29_970);
    });
  });

  describe('US-PF-06: dividends and distributions (TS §6.5, §7.4)', () => {
    it('credits the shares held at the previous close on the payment date', () => {
      const { instrumentId, cents, tick, paymentTick } = dividend;
      const engine = setup({ held: { [instrumentId]: 10 * SHARE } });
      engine.runUntil(tick);
      expect(engine.player.pendingDistributions).toEqual([
        {
          kind: 'dividend',
          depotId: DEPOT,
          instrumentId,
          accountId: CLEARING,
          quantity: 10 * SHARE,
          cents,
          amount: payout(cents, 10),
          exTick: tick,
          paymentTick,
        },
      ]);
      expect(engine.player.positions[0].distributions).toBe(payout(cents, 10));
      engine.runUntil(paymentTick - 1);
      expect(payouts(engine.drainTransactions())).toEqual([]);
      engine.drainEvents();
      engine.drainNotifications();
      engine.runUntil(paymentTick);
      expect(payouts(engine.drainTransactions())).toEqual([
        {
          tick: paymentTick,
          type: 'dividend',
          postings: [
            [CLEARING, payout(cents, 10)],
            [`external:issuer:${instrumentId}`, -payout(cents, 10)],
          ],
          refs: { depotId: DEPOT, instrumentId },
          params: { quantity: 10 * SHARE, cents },
        },
      ]);
      expect(engine.player.balances.get(CLEARING)).toBe(payout(cents, 10));
      expect(engine.player.pendingDistributions).toEqual([]);
      expect(engine.player.monthlyValues.dividends).toBe(payout(cents, 10));
      expect(engine.drainEvents().filter(({ type }) => type === 'distribution-paid')).toEqual([
        {
          type: 'distribution-paid',
          tick: paymentTick,
          kind: 'dividend',
          accountId: CLEARING,
          depotId: DEPOT,
          instrumentId,
          quantity: 10 * SHARE,
          amount: payout(cents, 10),
          tax: 0,
        },
      ]);
      expect(engine.drainNotifications()).toEqual([
        expect.objectContaining({
          tick: paymentTick,
          code: 'dividend-received',
          params: {
            kind: 'dividend',
            accountId: CLEARING,
            depotId: DEPOT,
            instrumentId,
            quantity: 10 * SHARE,
            amount: payout(cents, 10),
            tax: 0,
          },
        }),
      ]);
    });

    it('pays for a sale on the ex-date, but not for a purchase on it', () => {
      const { instrumentId, cents, tick, paymentTick } = dividend;
      const engine = setup({ balance: 1_000_000, held: { [instrumentId]: 10 * SHARE } });
      engine.runUntil(tick);
      // The exchange is open at the ex-date's open: the sale and the purchase execute at once.
      const sold = apply(engine, {
        type: 'placeOrder',
        order: market(instrumentId, 'sell', 10 * SHARE),
      });
      const bought = apply(engine, {
        type: 'placeOrder',
        order: market(instrumentId, 'buy', 4 * SHARE),
      });
      expect([sold.ok, bought.ok]).toEqual([true, true]);
      expect(engine.player.positions).toMatchObject([{ quantity: 4 * SHARE, distributions: 0 }]);
      engine.runUntil(paymentTick);
      expect(
        engine
          .drainTransactions()
          .filter(({ type }) => type === 'dividend')
          .map(({ postings }) => postings[0].amount),
      ).toEqual([payout(cents, 10)]);
    });

    it('does not pay a purchase at the open of the ex-date', () => {
      // A market order placed before the open executes at the open, after the ex-date took effect.
      const { instrumentId, tick, paymentTick } = dividend;
      const engine = setup({ balance: 1_000_000 });
      engine.runUntil(tick - 1);
      expect(
        apply(engine, { type: 'placeOrder', order: market(instrumentId, 'buy', 5 * SHARE) }).ok,
      ).toBe(true);
      engine.runUntil(paymentTick);
      expect(engine.player.positions).toMatchObject([{ quantity: 5 * SHARE, distributions: 0 }]);
      expect(payouts(engine.drainTransactions())).toEqual([]);
    });

    it('credits the distribution of a distributing ETF', () => {
      const { instrumentId, cents, paymentTick } = distribution;
      const engine = setup({ held: { [instrumentId]: 2_500_000 } });
      engine.runUntil(paymentTick);
      // 2,5 shares × cents, rounded half away from zero
      const amount = payout(cents, 2.5);
      expect(payouts(engine.drainTransactions())).toEqual([
        {
          tick: paymentTick,
          type: 'fund-distribution',
          postings: [
            [CLEARING, amount],
            [`external:issuer:${instrumentId}`, -amount],
          ],
          refs: { depotId: DEPOT, instrumentId },
          params: { quantity: 2_500_000, cents },
        },
      ]);
      expect(engine.player.positions[0].distributions).toBe(amount);
    });

    it('pays every depot its own payout and plans one payment for the date', () => {
      const { instrumentId, cents, tick, paymentTick } = dividend;
      const engine = setup({
        held: { [instrumentId]: 10 * SHARE },
        second: { [instrumentId]: 4 * SHARE },
      });
      engine.drainChangedDepots();
      engine.runUntil(tick);
      expect(engine.drainChangedDepots()).toEqual([DEPOT, 'dep-5']);
      expect(
        engine.player.pendingDistributions.map(({ depotId, accountId, amount }) => [
          depotId,
          accountId,
          amount,
        ]),
      ).toEqual([
        [DEPOT, CLEARING, payout(cents, 10)],
        ['dep-5', 'acc-4', payout(cents, 4)],
      ]);
      const tasks = engine
        .snapshot()
        .scheduler.heap.filter(({ kind }) => kind === 'distribution-payment');
      expect(tasks.map(({ tick: due }) => due)).toEqual([paymentTick]);
      engine.runUntil(paymentTick);
      expect(engine.player.balances.get(CLEARING)).toBe(payout(cents, 10));
      expect(engine.player.balances.get('acc-4')).toBe(payout(cents, 4));
    });

    it('earns nothing for a holding whose payout rounds to 0', () => {
      // One millionth of a share earns cents / 1.000.000 < 0,5 cent.
      const { instrumentId, tick, paymentTick } = dividend;
      const engine = setup({ held: { [instrumentId]: 1 } });
      engine.runUntil(tick);
      expect(engine.player.pendingDistributions).toEqual([]);
      engine.runUntil(paymentTick);
      expect(payouts(engine.drainTransactions())).toEqual([]);
    });

    it('credits only the payouts due and keeps the later ones', () => {
      const [first, next] = overlapping;
      const engine = setup({ held: { [first.instrumentId]: SHARE, [next.instrumentId]: SHARE } });
      engine.runUntil(first.paymentTick);
      expect(payouts(engine.drainTransactions())).toEqual([
        expect.objectContaining({
          tick: first.paymentTick,
          refs: { depotId: DEPOT, instrumentId: first.instrumentId },
        }),
      ]);
      expect(engine.player.pendingDistributions).toEqual([
        expect.objectContaining({ instrumentId: next.instrumentId, paymentTick: next.paymentTick }),
      ]);
      engine.runUntil(next.paymentTick);
      expect(payouts(engine.drainTransactions())).toEqual([
        expect.objectContaining({
          tick: next.paymentTick,
          refs: { depotId: DEPOT, instrumentId: next.instrumentId },
        }),
      ]);
    });

    it('credits the target account when the depot closed between ex-date and payment date', () => {
      // Sale on the ex-date at the bid: 10 × 99,90 − 0,90 = 998,10 €; the clearing account starts
      // at −998,10 €, so nothing remains and only the pending dividend needs the target.
      const { instrumentId, cents, tick, paymentTick } = dividend;
      const engine = setup({
        balance: -99_810,
        held: { [instrumentId]: 10 * SHARE },
        second: { [instrumentId]: SHARE },
      });
      engine.runUntil(tick);
      apply(engine, { type: 'placeOrder', order: market(instrumentId, 'sell', 10 * SHARE) });
      expect(engine.player.balances.get(CLEARING)).toBe(0);
      expect(engine.closingPreview(CLEARING)).toEqual({
        ok: true,
        preview: {
          bookings: [],
          remainder: 0,
          pendingDistributions: payout(cents, 10),
          blockers: [],
        },
      });
      expect(apply(engine, { type: 'closeAccount', accountId: CLEARING })).toEqual({
        ok: false,
        error: 'target-required',
      });
      expect(
        apply(engine, { type: 'closeAccount', accountId: CLEARING, targetAccountId: 'acc-1' }),
      ).toEqual({ ok: true });
      expect(engine.player.depots[0].closedAt).toBe(tick);
      engine.drainTransactions();
      engine.runUntil(paymentTick);
      const credited = engine.drainTransactions().filter(({ type }) => type === 'dividend');
      // The other depot's payout stays with its own clearing account.
      expect(credited.map(({ postings }) => postings[0])).toEqual([
        expect.objectContaining({ account: 'acc-1', amount: payout(cents, 10) }),
        expect.objectContaining({ account: 'acc-4', amount: payout(cents, 1) }),
      ]);
      expect(credited[0].refs).toEqual({ depotId: DEPOT, instrumentId });
      expect(engine.player.balances.get(CLEARING)).toBe(0);
    });
  });

  describe('US-BK-08: custody fee (TS §7.3, §7.4)', () => {
    function custodyFees(journal: readonly Transaction[]): unknown[] {
      return journal
        .filter(({ type }) => type === 'custody-fee')
        .map(({ tick, postings, params }) => ({
          tick,
          postings: postings.map(({ account, amount }) => [account, amount]),
          params,
        }));
    }

    it('charges the past quarter on the average end-of-day value at the first bank run', () => {
      // 10 shares at the bid 99,90 €: 999,00 € on all 91 days of the 2nd quarter (the depot opened
      // on 01.04.2030). 1 % p. a.: 9,99 € × ¼ = 2,4975 € → 2,50 € on Mo 01.07.2030, 06:00.
      const engine = setup({ bank: 'bc', held: { [ids[0]]: 10 * SHARE } });
      engine.runUntil(at(7, 1, 5, 59));
      expect(custodyFees(engine.drainTransactions())).toEqual([]);
      engine.runUntil(at(7, 1, 6));
      expect(custodyFees(engine.drainTransactions())).toEqual([
        {
          tick: at(7, 1, 6),
          postings: [
            [CLEARING, -250],
            ['external:bank:bc:fees', 250],
          ],
          params: { from: '2030-04', to: '2030-06', days: 91, averageValue: 99_900 },
        },
      ]);
      // Fees of July so far: the account fee of June on `acc-1` (12,00 €) and the custody fee.
      expect(engine.player.monthlyValues.fees).toBe(1_200 + 250);
    });

    it('charges a depot opened in the quarter pro rata, also on an empty clearing account', () => {
      // Opened Sa 01.06.2030: 30 of 91 days, 50 € p. a.: 50 × 30 / 364 = 4,1209… → 4,12 €.
      const engine = setup();
      engine.runUntil(at(6, 1, 12));
      expect(apply(engine, { type: 'openAccount', bankId: 'bk', kind: 'depot' })).toEqual({
        ok: true,
        opened: { accountId: 'acc-4', depotId: 'dep-5' },
      });
      engine.drainEvents();
      engine.runUntil(at(7, 1, 6));
      expect(custodyFees(engine.drainTransactions())).toEqual([
        {
          tick: at(7, 1, 6),
          postings: [
            ['acc-4', -412],
            ['external:bank:bk:fees', 412],
          ],
          params: { from: '2030-04', to: '2030-06', days: 30, averageValue: 0 },
        },
      ]);
      expect(engine.player.balances.get('acc-4')).toBe(-412);
      expect(engine.drainEvents()).toContainEqual({
        type: 'account-uncovered',
        tick: at(7, 1, 6),
        accountId: 'acc-4',
        balance: -412,
        limit: null,
      });
    });

    it('charges the closing quarter pro rata with the settlement', () => {
      // Opened Sa 01.06.2030, closed Mo 10.06.2030: 10 days, 50 × 10 / 364 = 1,3736… → 1,37 €.
      const engine = setup();
      engine.runUntil(at(6, 1, 12));
      apply(engine, { type: 'openAccount', bankId: 'bk', kind: 'depot' });
      apply(engine, {
        type: 'transfer',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-4',
        amount: 1_000,
        purpose: '',
      });
      engine.runUntil(at(6, 10, 12));
      const preview = engine.closingPreview('acc-4');
      expect(preview).toEqual({
        ok: true,
        preview: {
          bookings: [
            {
              type: 'custody-fee',
              amount: -137,
              params: { from: '2030-04', to: '2030-06', days: 10, averageValue: 0 },
            },
          ],
          remainder: 863,
          pendingDistributions: 0,
          blockers: [],
        },
      });
      engine.drainTransactions();
      expect(
        apply(engine, { type: 'closeAccount', accountId: 'acc-4', targetAccountId: 'acc-1' }),
      ).toEqual({ ok: true });
      expect(custodyFees(engine.drainTransactions())).toHaveLength(1);
      engine.runUntil(at(7, 1, 6));
      expect(custodyFees(engine.drainTransactions())).toEqual([]);
    });
  });
});
