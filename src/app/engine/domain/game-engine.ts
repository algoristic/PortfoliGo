import { nextBankRunTick } from '@app/banking/domain/bank-run-logic';
import { findHomeBank } from '@app/banking/domain/home-bank-logic';
import { startInflows } from '@app/banking/domain/inflow-logic';
import { OPENING_BALANCE_ACCOUNT } from '@app/banking/domain/ledger-logic';
import {
  AccountId,
  DepotId,
  OPENABLE_ACCOUNT_KINDS,
} from '@app/banking/domain/models/account.model';
import { ClosedMonth } from '@app/banking/domain/models/household.model';
import { Transaction, TransactionDraft } from '@app/banking/domain/models/ledger.model';
import { emptyMonthlyValues } from '@app/banking/domain/monthly-values-logic';
import {
  dayIndex,
  dayStartTick,
  GAME_START_TICK,
  startOfNextMonth,
  startOfNextYear,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { paymentDay } from '@app/market/domain/dividend-logic';
import { marketChecksum } from '@app/market/domain/market-checksum';
import { createFactorHistory } from '@app/market/domain/market-history';
import { restoreMarket, snapshotMarket } from '@app/market/domain/market-snapshot';
import { advanceMarket, createMarketDay, createMarketState } from '@app/market/domain/market-step';
import { MarketDay } from '@app/market/domain/models/market-day.model';
import {
  FactorHistory,
  FactorStateEntry,
  MarketState,
} from '@app/market/domain/models/market-state.model';
import { PriceSource } from '@app/market/domain/price-source';
import { etfSeries, seriesIds } from '@app/market/domain/series';
import { watchlistError } from '@app/market/domain/watchlist-logic';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { openTaxYear } from '@app/taxes/domain/tax-logic';
import { copyPosition } from '@app/trading/domain/position-logic';

import { BankCommands, ClosingPreviewResult } from './bank-commands';
import { AccountBooks, BankingSystem, openAccount } from './banking-system';
import { DistributionSystem } from './distribution-system';
import { CommandResult, GameCommand } from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import {
  BACKGROUND_MODES,
  GameSnapshot,
  GameState,
  PlayerState,
  StartConditions,
} from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { PricePort } from './models/price-port.model';
import { ExDividend, ScheduledTask } from './models/scheduled-task.model';
import { NotificationSystem } from './notification-system';
import { copyOrder, OrderSystem } from './order-system';
import { copyScheduler, createScheduler, peekTask, popTask, scheduleTask } from './scheduler';
import { Valuation } from './valuation';

/** Creates the price port over the engine's market; the history and the state grow in place. */
export type PricePortFactory = (
  world: GameWorld,
  history: FactorHistory,
  market: Readonly<MarketState>,
) => PricePort;

export interface GameEngineOptions {
  /** Defaults to a `PriceSource` (`priceSourcePort`). */
  prices?: PricePortFactory;
}

export interface RestoreOptions extends GameEngineOptions {
  /**
   * Stored market states at month starts (TS §6.8, E-08), ascending from the epoch. Missing or
   * inconsistent entries are rebuilt by day steps (from the epoch in the worst case).
   */
  monthStarts?: readonly FactorStateEntry[];
}

export const priceSourcePort: PricePortFactory = (world, history, market) =>
  new PriceSource(world.context, history, market);

/**
 * The pure, deterministic engine (TS §2.2, §8.1). It knows no clock: the host calls `runUntil`
 * with its target tick and a `shouldYield` callback. Ticks without due tasks and without an active
 * order at an open exchange change nothing and are skipped. Create it with `start` or `restore`.
 */
export class GameEngine {
  readonly world: GameWorld;
  readonly prices: PricePort;
  readonly #state: GameState;
  readonly #history: FactorHistory;
  /** Reused buffer of the day step; not part of the state. */
  readonly #marketDay: MarketDay;
  readonly #banking: BankingSystem;
  readonly #bankCommands: BankCommands;
  readonly #notifications: NotificationSystem;
  readonly #orders: OrderSystem;
  readonly #distributions: DistributionSystem;
  readonly #valuation: Valuation;
  #events: EngineEvent[] = [];
  #journal: Transaction[] = [];
  /** Accounts whose projection changed since the last `drainChangedAccounts` (TS §8.4). */
  #changedAccounts = new Set<AccountId>();
  /** Orders placed, changed or closed since the last `drainChangedOrders`. */
  #changedOrders = new Set<string>();
  /** Depots whose positions changed since the last `drainChangedDepots`. */
  #changedDepots = new Set<DepotId>();
  /** IDs of all instruments of the world, made on the first `updateWatchlist`. */
  #instrumentIds: ReadonlySet<string> | null = null;

  constructor(
    world: GameWorld,
    state: GameState,
    history: FactorHistory,
    options: GameEngineOptions = {},
  ) {
    this.world = world;
    this.#state = state;
    this.#history = history;
    this.#marketDay = createMarketDay(world.context);
    this.prices = (options.prices ?? priceSourcePort)(world, history, state.market);
    const changed = (id: AccountId): void => {
      this.#changedAccounts.add(id);
    };
    this.#notifications = new NotificationSystem(state.player);
    this.#banking = new BankingSystem(world, state.player, {
      journal: (transaction) => this.#journal.push(transaction),
      emit: (event) => this.#emit(event),
      changed,
    });
    const taxCapitalIncome = this.#banking.taxCapitalIncome.bind(this.#banking);
    const changedDepot = (id: DepotId): void => {
      this.#changedDepots.add(id);
    };
    this.#distributions = new DistributionSystem(world, state.player, {
      book: (draft) => this.#banking.book(draft),
      emit: (event) => this.#emit(event),
      schedulePayment: (tick) => {
        scheduleTask(this.#state.scheduler, tick, { kind: 'distribution-payment' });
      },
      changedDepot,
      taxCapitalIncome,
    });
    this.#bankCommands = new BankCommands(
      world,
      state.player,
      this.#banking,
      this.#distributions,
      changed,
    );
    this.#valuation = new Valuation(world, this.prices);
    this.#orders = new OrderSystem(world, state.player, this.prices, {
      book: (draft) => this.#banking.book(draft),
      emit: (event) => this.#emit(event),
      scheduleExpiry: (tick, orderId) => {
        scheduleTask(this.#state.scheduler, tick, { kind: 'order-expiry', orderId });
      },
      changedAccount: changed,
      changedOrder: (id) => {
        this.#changedOrders.add(id);
      },
      changedDepot,
      taxCapitalIncome,
    });
  }

  /**
   * New game: prehistory from the epoch (TS §6.8), then the first tick `GAME_START_TICK`
   * (Monday, 01.04.2030, 00:00) is processed. A current account at the home bank becomes the
   * salary account and receives the start capital (TS §7.2); it starts with the full overdraft
   * limit, as if it had received the net income in the three previous months (TS §7.4). Events and
   * the opening transaction wait in the buffers.
   */
  static start(
    world: GameWorld,
    start: StartConditions,
    options: GameEngineOptions = {},
  ): GameEngine {
    const { context } = world;
    const homeBank = findHomeBank(world.world.banks);
    if (homeBank === undefined) {
      throw new Error('GameEngine.start: the world has no branch bank');
    }
    const market = createMarketState(context);
    const history = createFactorHistory();
    advanceMarket(context, market, dayIndex(GAME_START_TICK), { history });
    const scheduler = createScheduler();
    scheduleTask(scheduler, GAME_START_TICK, { kind: 'day-change' });
    scheduleTask(scheduler, startOfNextMonth(GAME_START_TICK), { kind: 'month-end' });
    scheduleTask(scheduler, startOfNextYear(GAME_START_TICK), { kind: 'year-end' });
    scheduleTask(scheduler, nextBankRunTick(GAME_START_TICK), { kind: 'bank-run' });
    const books: AccountBooks = {
      accounts: [],
      balances: new Map(),
      accountSequence: 0,
      overdraftLimits: [],
      inflows: [],
      interest: [],
    };
    const salaryAccount = openAccount(books, 'current', homeBank.id, GAME_START_TICK);
    books.inflows = [startInflows(salaryAccount.id, start.netIncome)];
    const state: GameState = {
      tick: GAME_START_TICK - TICKS_PER_MINUTE,
      market,
      player: {
        start: { ...start },
        homeBankId: homeBank.id,
        backgroundMode: 'realtime',
        ...books,
        depots: [],
        salaryAccountId: salaryAccount.id,
        nextTransactionSeq: 1,
        taxYear: openTaxYear(tickToDateTime(GAME_START_TICK).year),
        closedTaxYears: [],
        monthlyValues: emptyMonthlyValues(),
        closedMonths: [],
        notifications: { nextSeq: 1, readUpTo: 0, readSeqs: [], autoPause: {} },
        watchlist: [],
        orders: [],
        orderHistory: [],
        orderSequence: 0,
        positions: [],
        pendingDistributions: [],
        custody: [],
      },
      scheduler,
      commandIds: [],
    };
    const engine = new GameEngine(world, state, history, options);
    engine.step();
    engine.#banking.updateLimits(engine.tick);
    if (start.startCapital !== 0) {
      engine.#book({
        tick: engine.tick,
        type: 'opening-balance',
        postings: [
          { account: salaryAccount.id, amount: start.startCapital },
          { account: OPENING_BALANCE_ACCOUNT, amount: -start.startCapital },
        ],
      });
    }
    return engine;
  }

  /**
   * Continues a game from a snapshot (TS §9.2). Snapshot, restore and running on equal an
   * uninterrupted run; events and transactions that were not drained before the snapshot are not
   * restored.
   */
  static restore(
    world: GameWorld,
    snapshot: GameSnapshot,
    options: RestoreOptions = {},
  ): GameEngine {
    const state = copyState(snapshot);
    const history = restoreHistory(world, state.market, options.monthStarts ?? []);
    return new GameEngine(world, state, history, options);
  }

  get tick(): Tick {
    return this.#state.tick;
  }

  get player(): Readonly<PlayerState> {
    return this.#state.player;
  }

  /**
   * Applies a game command after the current tick (TS §3.8, §8.5). Its tick must be the current
   * tick; a command whose ID was already applied at this tick has no further effect. Rejected
   * commands count as applied too: replayed after a snapshot of their tick, a command rejected
   * before it must not succeed because of a later command of the same tick.
   */
  applyCommand(command: GameCommand): CommandResult {
    if (command.tick !== this.#state.tick) {
      return { ok: false, error: 'tick-mismatch' };
    }
    if (this.#state.commandIds.includes(command.id)) {
      return { ok: true };
    }
    this.#state.commandIds.push(command.id);
    return this.#execute(command);
  }

  /** Processes the next tick. */
  step(): void {
    this.#processTick(this.#state.tick + 1);
  }

  /**
   * Processes the ticks up to `targetTick`. Checks `shouldYield` after every processed tick (due
   * tasks or active orders at an open exchange) and returns `false` when it stopped early; the
   * result never depends on where it stops.
   */
  runUntil(targetTick: Tick, shouldYield: () => boolean = () => false): boolean {
    while (this.#state.tick < targetTick) {
      const following = this.#state.tick + 1;
      const next = this.#orders.needsTick(following)
        ? following
        : Math.max(peekTask(this.#state.scheduler)?.tick ?? targetTick, following);
      if (next > targetTick) {
        this.#setTick(targetTick);
        return true;
      }
      this.#processTick(next);
      if (this.#state.tick < targetTick && shouldYield()) {
        return false;
      }
    }
    return true;
  }

  /** Returns the buffered events in order and empties the buffer. */
  drainEvents(): EngineEvent[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  /**
   * Returns the transactions booked since the last call in journal order and empties the buffer
   * (TS §7.2, §9.2); the host stores them.
   */
  drainTransactions(): Transaction[] {
    const journal = this.#journal;
    this.#journal = [];
    return journal;
  }

  /**
   * Returns the notifications created since the last call in order of their running numbers and
   * empties the buffer (TS §12); the host stores and sends them.
   */
  drainNotifications(): GameNotification[] {
    return this.#notifications.drain();
  }

  /**
   * The first notification in the buffer whose code has auto-pause on (TS §12), else `null`. The
   * host checks it in `shouldYield` to stop at exactly the tick of the notification and decides
   * whether the pause applies (run mode, visibility); `drainNotifications` resets it.
   */
  get autoPauseNotification(): GameNotification | null {
    return this.#notifications.autoPauseNotification;
  }

  /**
   * IDs of the accounts whose projection changed since the last call (postings, limits, opening,
   * closing, salary flag), in the order of their first change; the host sends them (TS §8.4).
   */
  drainChangedAccounts(): AccountId[] {
    const changed = [...this.#changedAccounts];
    this.#changedAccounts = new Set();
    return changed;
  }

  /** IDs of the orders placed, changed or closed since the last call, in order of first change. */
  drainChangedOrders(): string[] {
    const changed = [...this.#changedOrders];
    this.#changedOrders = new Set();
    return changed;
  }

  /** IDs of the depots whose positions changed since the last call (executions). */
  drainChangedDepots(): DepotId[] {
    const changed = [...this.#changedDepots];
    this.#changedDepots = new Set();
    return changed;
  }

  /**
   * Value of all positions now (TS §7.9): shares × bid without a bank's venue mark-up. Part of the
   * net worth; the host computes it only when it sends a projection.
   */
  securitiesValue(): Cents {
    return this.#valuation.holdingsValue(this.#state.player.positions, this.#state.tick);
  }

  /** What closing the account now would book, without booking (TS §7.4). */
  closingPreview(accountId: string): ClosingPreviewResult {
    return this.#bankCommands.closingPreview(accountId, this.#state.tick);
  }

  /** Copy of the state that shares nothing mutable with the engine (structured-cloneable). */
  snapshot(): GameSnapshot {
    return copyState(this.#state);
  }

  /** Market states at the month starts after `day`, for the host to store (TS §6.8, E-08). */
  monthStartsAfter(day: number): FactorStateEntry[] {
    return this.#history.monthStarts.filter((entry) => entry.day > day);
  }

  #execute(command: GameCommand): CommandResult {
    switch (command.type) {
      case 'setBackgroundMode':
        if (!BACKGROUND_MODES.includes(command.mode)) {
          return { ok: false, error: 'invalid-command' };
        }
        this.#state.player.backgroundMode = command.mode;
        this.#emit({
          type: 'background-mode-changed',
          tick: this.#state.tick,
          mode: command.mode,
        });
        return { ok: true };
      case 'openAccount':
        if (!OPENABLE_ACCOUNT_KINDS.includes(command.kind)) {
          return { ok: false, error: 'invalid-command' };
        }
        return this.#bankCommands.openAccount(command, this.#state.tick);
      case 'closeAccount':
        return this.#bankCommands.closeAccount(command, this.#state.tick);
      case 'setSalaryAccount':
        return this.#bankCommands.setSalaryAccount(command);
      case 'transfer':
        if (typeof command.purpose !== 'string') {
          return { ok: false, error: 'invalid-command' };
        }
        return this.#bankCommands.transfer(command, this.#state.tick);
      case 'setAutoPause':
        return this.#notifications.setAutoPause(command);
      case 'markNotificationsRead':
        return this.#notifications.markRead(command);
      case 'updateWatchlist':
        return this.#updateWatchlist(command.ids);
      case 'placeOrder':
        return this.#orders.place(command.order, this.#state.tick);
      case 'changeOrder':
        return this.#orders.change(command.orderId, command.change, this.#state.tick);
      case 'cancelOrder':
        return this.#orders.cancel(command.orderId, this.#state.tick);
      default:
        return { ok: false, error: 'invalid-command' };
    }
  }

  /** Replaces the watchlist when the new list is valid (US-MK-04, TS §8.2). */
  #updateWatchlist(ids: unknown): CommandResult {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      return { ok: false, error: 'invalid-command' };
    }
    this.#instrumentIds ??= new Set(seriesIds(this.world.context));
    const error = watchlistError(ids, this.#instrumentIds);
    if (error !== null) {
      return { ok: false, error };
    }
    this.#state.player.watchlist = ids.slice();
    return { ok: true };
  }

  /** Buffers an event and the notifications it creates (TS §12). */
  #emit(event: EngineEvent): void {
    this.#events.push(event);
    this.#notifications.fromEvent(event);
  }

  /** Books a transaction on the player's balances and buffers it for the journal (TS §7.2). */
  #book(draft: TransactionDraft): Transaction {
    return this.#banking.book(draft);
  }

  #setTick(tick: Tick): void {
    if (tick !== this.#state.tick) {
      this.#state.tick = tick;
      this.#state.commandIds.length = 0;
    }
  }

  /**
   * Runs all tasks due at or before `tick` in the order of the scheduler, then checks the active
   * orders (TS §3.8, steps 1 and 2).
   */
  #processTick(tick: Tick): void {
    this.#setTick(tick);
    const { scheduler } = this.#state;
    for (let task = peekTask(scheduler); task !== undefined && task.tick <= tick;) {
      popTask(scheduler);
      this.#run(task, tick);
      task = peekTask(scheduler);
    }
    this.#orders.trade(tick);
  }

  #run(task: ScheduledTask, tick: Tick): void {
    switch (task.kind) {
      case 'day-change':
        this.#dayChange(tick);
        break;
      case 'bank-run':
        this.#banking.runBank(tick);
        scheduleTask(this.#state.scheduler, nextBankRunTick(tick + TICKS_PER_MINUTE), {
          kind: 'bank-run',
        });
        break;
      case 'session-open': {
        const exchangeId = this.world.exchanges[task.exchange].id;
        this.#events.push({ type: 'session-opened', tick, exchangeId });
        for (const { series, cents, paymentDay: payment } of task.dividends) {
          this.#events.push({ type: 'ex-dividend', tick, series, cents, paymentDay: payment });
        }
        this.#distributions.exDate(tick, task.dividends);
        break;
      }
      case 'distribution-payment':
        this.#distributions.pay(tick);
        break;
      case 'session-close': {
        const exchange = this.world.exchanges[task.exchange];
        this.#events.push({
          type: 'session-closed',
          tick,
          exchangeId: exchange.id,
          day: dayIndex(tick),
          series: exchange.closingSeries,
        });
        break;
      }
      case 'order-expiry':
        this.#orders.expire(task.orderId, tick);
        break;
      case 'month-end': {
        const { year, month } = tickToDateTime(tick - TICKS_PER_MINUTE);
        this.#banking.closeMonth(tick);
        this.#emit({ type: 'month-ended', tick, year, month });
        this.#notifications.monthClosed(
          tick,
          this.#state.player.closedMonths.at(-1) as ClosedMonth,
        );
        scheduleTask(this.#state.scheduler, startOfNextMonth(tick), { kind: 'month-end' });
        break;
      }
      case 'year-end': {
        const closing = this.#state.player.taxYear;
        this.#banking.closeYear();
        this.#emit({ type: 'year-ended', tick, year: tickToDateTime(tick).year - 1 });
        this.#notifications.yearClosed(tick, closing);
        scheduleTask(this.#state.scheduler, startOfNextYear(tick), { kind: 'year-end' });
        break;
      }
      default: {
        // Only a corrupted snapshot holds other kinds.
        const { kind } = task as ScheduledTask;
        throw new Error(`GameEngine: no system for task ${kind}`);
      }
    }
  }

  /**
   * Day change at 00:00: the market day step on trading days, then the interest of the day that
   * ended (TS §3.8), then the next day.
   */
  #dayChange(tick: Tick): void {
    const day = dayIndex(tick);
    advanceMarket(
      this.world.context,
      this.#state.market,
      day + 1,
      { history: this.#history, onDay: (marketDay) => this.#onMarketDay(marketDay, tick) },
      this.#marketDay,
    );
    this.#banking.accrueInterest();
    const { positions } = this.#state.player;
    const endOfDay = tick - TICKS_PER_MINUTE;
    this.#banking.accrueCustody((depot) =>
      this.#valuation.holdingsValue(
        positions.filter((position) => position.depotId === depot.id),
        endOfDay,
        tick,
      ),
    );
    scheduleTask(this.#state.scheduler, dayStartTick(day + 1), { kind: 'day-change' });
  }

  #onMarketDay(marketDay: Readonly<MarketDay>, tick: Tick): void {
    this.prices.rememberDay(marketDay);
    const { context, exchanges } = this.world;
    const day = marketDay.day;
    for (let i = 0; i < context.layout.instrumentIds.length; i++) {
      if (marketDay.announcedExDay[i] >= 0) {
        this.#events.push({
          type: 'dividend-announced',
          tick,
          series: i,
          cents: marketDay.announcedCents[i],
          exDay: marketDay.announcedExDay[i],
        });
      }
    }
    const payment = paymentDay(day);
    const start = dayStartTick(day);
    exchanges.forEach((exchange, x) => {
      const dividends: ExDividend[] = [];
      for (const i of exchange.stocks) {
        const cents = marketDay.exDividendCents[i];
        if (cents > 0) {
          dividends.push({ series: i, cents, paymentDay: payment });
        }
      }
      for (const e of exchange.etfs) {
        const cents = marketDay.etfExCents[e];
        if (cents > 0) {
          dividends.push({ series: etfSeries(context, e), cents, paymentDay: payment });
        }
      }
      const { scheduler } = this.#state;
      scheduleTask(scheduler, start + exchange.open * TICKS_PER_MINUTE, {
        kind: 'session-open',
        exchange: x,
        dividends,
      });
      scheduleTask(scheduler, start + exchange.close * TICKS_PER_MINUTE, {
        kind: 'session-close',
        exchange: x,
      });
    });
  }
}

function copyState(state: Readonly<GameState>): GameState {
  return {
    tick: state.tick,
    market: snapshotMarket(state.market),
    player: copyPlayer(state.player),
    scheduler: copyScheduler(state.scheduler),
    commandIds: state.commandIds.slice(),
  };
}

function copyPlayer(player: Readonly<PlayerState>): PlayerState {
  return {
    start: { ...player.start },
    homeBankId: player.homeBankId,
    backgroundMode: player.backgroundMode,
    accounts: player.accounts.map((account) => ({ ...account })),
    depots: player.depots.map((depot) => ({ ...depot })),
    balances: new Map(player.balances),
    salaryAccountId: player.salaryAccountId,
    accountSequence: player.accountSequence,
    nextTransactionSeq: player.nextTransactionSeq,
    overdraftLimits: player.overdraftLimits.map((entry) => ({ ...entry })),
    inflows: player.inflows.map((entry) => ({ ...entry, salaryWindow: [...entry.salaryWindow] })),
    interest: player.interest.map((accrual) => ({ ...accrual })),
    taxYear: { ...player.taxYear },
    closedTaxYears: player.closedTaxYears.map((year) => ({ ...year })),
    monthlyValues: { ...player.monthlyValues },
    closedMonths: player.closedMonths.map(({ month, values }) => ({
      month: { ...month },
      values: { ...values },
    })),
    notifications: {
      ...player.notifications,
      readSeqs: player.notifications.readSeqs.slice(),
      autoPause: { ...player.notifications.autoPause },
    },
    watchlist: player.watchlist.slice(),
    orders: player.orders.map(copyOrder),
    orderHistory: player.orderHistory.map(copyOrder),
    orderSequence: player.orderSequence,
    positions: player.positions.map(copyPosition),
    pendingDistributions: player.pendingDistributions.map((distribution) => ({ ...distribution })),
    custody: player.custody.map((accrual) => ({ ...accrual })),
  };
}

/**
 * Market states at month starts up to the market day of the snapshot: the given entries plus day
 * steps from the last of them. The result must reproduce the snapshot's market state; if it does
 * not, the entries are discarded and rebuilt from the epoch (TS §6.8).
 */
function restoreHistory(
  world: GameWorld,
  market: Readonly<MarketState>,
  monthStarts: readonly FactorStateEntry[],
): FactorHistory {
  const given = monthStarts.filter((entry) => entry.day <= market.day);
  const history =
    rebuild(world, market, given) ?? (given.length > 0 ? rebuild(world, market, []) : null);
  if (history === null) {
    throw new Error('GameEngine.restore: the snapshot does not belong to this world');
  }
  return history;
}

function rebuild(
  world: GameWorld,
  market: Readonly<MarketState>,
  base: readonly FactorStateEntry[],
): FactorHistory | null {
  const history: FactorHistory = { monthStarts: base.slice() };
  const last = base[base.length - 1];
  const state = last === undefined ? createMarketState(world.context) : restoreMarket(last);
  advanceMarket(world.context, state, market.day, { history });
  return marketChecksum(state) === marketChecksum(market) ? history : null;
}
