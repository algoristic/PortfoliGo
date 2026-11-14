import { monthKey } from '@app/banking/domain/calendar-month-logic';
import { AccountId, Depot, DepotId } from '@app/banking/domain/models/account.model';
import { DepotConditions, FeeModel } from '@app/banking/domain/models/bank-conditions.model';
import { Transaction, TransactionDraft } from '@app/banking/domain/models/ledger.model';
import { laterMonth } from '@app/banking/domain/standing-order-logic';
import { Tick, TICKS_PER_MINUTE, TradingHours } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';
import {
  SavingsPlan,
  SavingsPlanChange,
  SavingsPlanSpec,
  SavingsPlanView,
} from '@app/trading/domain/models/savings-plan.model';
import { isAtPriceFloor } from '@app/trading/domain/order-command-logic';
import { bookPurchase } from '@app/trading/domain/position-logic';
import {
  savingsPlanChangeError,
  savingsPlanError,
  savingsPlanFailure,
  savingsPlanFill,
  savingsPlanId,
  savingsPlanTarget,
  savingsPlanTransaction,
} from '@app/trading/domain/savings-plan-logic';
import {
  nextSavingsPlanTick,
  savingsPlanDueMonth,
  savingsPlanHandledBefore,
  savingsPlanNextExecution,
} from '@app/trading/domain/savings-plan-schedule-logic';

import { instrumentSessions } from './instrument-sessions';
import {
  ChangeSavingsPlanCommand,
  CommandResult,
  CreateSavingsPlanCommand,
  DeleteSavingsPlanCommand,
  SetSavingsPlanPausedCommand,
} from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import { PlayerState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { PricePort } from './models/price-port.model';

/** Where the savings plan system delivers its results; the engine wires them to its other systems. */
export interface SavingsPlanPorts {
  /** Books an execution through the banking system (monthly values, coverage events). */
  book(draft: TransactionDraft): Transaction;
  emit(event: EngineEvent): void;
  /** Available amount of an account after reservations (`BankingSystem.available`). */
  available(id: AccountId): Cents;
  /** A depot whose positions changed. */
  changedDepot(id: DepotId): void;
}

/**
 * Savings plans of the player (US-HD-05, TS §7.8): the commands `createSavingsPlan`,
 * `changeSavingsPlan`, `setSavingsPlanPaused` and `deleteSavingsPlan`, and the executions of the
 * task `savings-plan`. The rules are the pure functions of `trading/domain`; this class looks up
 * the state they need and applies their results. `nextTick` tells the engine where the one task
 * goes.
 */
export class SavingsPlanSystem {
  readonly #player: PlayerState;
  readonly #prices: PricePort;
  readonly #ports: SavingsPlanPorts;
  readonly #conditions: ReadonlyMap<string, DepotConditions>;
  readonly #fees: ReadonlyMap<string, FeeModel>;
  readonly #priceFloor: number;
  readonly #series: ReadonlyMap<string, number>;
  readonly #hours: readonly (TradingHours | null)[];
  /** Instrument ID → `savingsPlanEligible` for shares and ETFs. */
  readonly #eligible: ReadonlyMap<string, boolean>;

  constructor(world: GameWorld, player: PlayerState, prices: PricePort, ports: SavingsPlanPorts) {
    this.#player = player;
    this.#prices = prices;
    this.#ports = ports;
    this.#conditions = new Map(world.world.banks.map((bank) => [bank.id, bank.conditions.depot]));
    this.#fees = new Map(
      world.world.banks.map((bank) => [bank.id, bank.conditions.depot.savingsPlanFee]),
    );
    this.#priceFloor = world.context.config.priceFloor;
    const sessions = instrumentSessions(world);
    this.#series = sessions.series;
    this.#hours = sessions.hours;
    this.#eligible = new Map([
      ...world.world.companies.map((company): [string, boolean] => [
        company.id,
        company.savingsPlanEligible,
      ]),
      ...world.world.etfs.map((etf): [string, boolean] => [etf.id, etf.savingsPlanEligible]),
    ]);
  }

  /** The next execution of any plan after `tick`, `null` when no plan is active (TS §7.8). */
  nextTick(tick: Tick): Tick | null {
    return nextSavingsPlanTick(
      this.#player.savingsPlans,
      (plan) => this.#hoursOf(plan.instrumentId),
      tick + TICKS_PER_MINUTE,
    );
  }

  /** The plans for the UI with their next execution after `tick` (TS §8.3). */
  views(tick: Tick): SavingsPlanView[] {
    return this.#player.savingsPlans.map((plan) => ({
      ...plan,
      nextExecution: savingsPlanNextExecution(
        plan,
        this.#hoursOf(plan.instrumentId),
        tick + TICKS_PER_MINUTE,
      ),
    }));
  }

  create({ plan }: CreateSavingsPlanCommand, tick: Tick): CommandResult {
    const spec = savingsPlanSpec(plan);
    if (spec === null) {
      return { ok: false, error: 'invalid-command' };
    }
    const error = savingsPlanError(
      spec,
      savingsPlanTarget(spec, this.#player.depots, this.#fees, (id) => this.#eligibility(id)),
    );
    if (error !== null) {
      return { ok: false, error };
    }
    const sequence = this.#player.savingsPlanSequence + 1;
    const created: SavingsPlan = {
      id: savingsPlanId(sequence),
      ...spec,
      createdAt: tick,
      paused: false,
      handledUpTo: savingsPlanHandledBefore(
        spec.day,
        this.#hoursOf(spec.instrumentId),
        tick + TICKS_PER_MINUTE,
      ),
    };
    this.#player.savingsPlanSequence = sequence;
    this.#player.savingsPlans = [...this.#player.savingsPlans, created];
    return { ok: true, savingsPlanId: created.id };
  }

  /**
   * Replaces amount and day. A month already executed or failed stays done, and a new day whose
   * execution lies before the change waits for the next month.
   */
  change({ savingsPlanId: id, change }: ChangeSavingsPlanCommand, tick: Tick): CommandResult {
    const values = savingsPlanChange(change);
    if (values === null) {
      return { ok: false, error: 'invalid-command' };
    }
    const plan = this.#plan(id);
    if (plan === undefined) {
      return { ok: false, error: 'unknown-savings-plan' };
    }
    const error = savingsPlanChangeError(values, this.#feeOf(plan.depotId));
    if (error !== null) {
      return { ok: false, error };
    }
    this.#replace(plan, {
      ...plan,
      ...values,
      handledUpTo: laterMonth(
        plan.handledUpTo,
        savingsPlanHandledBefore(
          values.day,
          this.#hoursOf(plan.instrumentId),
          tick + TICKS_PER_MINUTE,
        ),
      ),
    });
    return { ok: true };
  }

  /**
   * Pauses or resumes a plan. A paused plan skips its executions; resuming does not make them up.
   * Pausing a paused plan changes nothing.
   */
  setPaused({ savingsPlanId: id, paused }: SetSavingsPlanPausedCommand, tick: Tick): CommandResult {
    if (typeof paused !== 'boolean') {
      return { ok: false, error: 'invalid-command' };
    }
    const plan = this.#plan(id);
    if (plan === undefined) {
      return { ok: false, error: 'unknown-savings-plan' };
    }
    if (plan.paused !== paused) {
      this.#replace(
        plan,
        paused
          ? { ...plan, paused }
          : {
              ...plan,
              paused,
              handledUpTo: laterMonth(
                plan.handledUpTo,
                savingsPlanHandledBefore(
                  plan.day,
                  this.#hoursOf(plan.instrumentId),
                  tick + TICKS_PER_MINUTE,
                ),
              ),
            },
      );
    }
    return { ok: true };
  }

  delete({ savingsPlanId: id }: DeleteSavingsPlanCommand): CommandResult {
    if (this.#plan(id) === undefined) {
      return { ok: false, error: 'unknown-savings-plan' };
    }
    this.#player.savingsPlans = this.#player.savingsPlans.filter((plan) => plan.id !== id);
    return { ok: true };
  }

  /**
   * Task `savings-plan` (TS §7.8): the plans due at `tick` in the order they were created; each one
   * buys or fails, either way its month is done.
   */
  run(tick: Tick): void {
    const plans = this.#player.savingsPlans;
    let changed: SavingsPlan[] | null = null;
    plans.forEach((plan, index) => {
      const month = savingsPlanDueMonth(plan, this.#hoursOf(plan.instrumentId), tick);
      if (month === null) {
        return;
      }
      changed ??= plans.slice();
      changed[index] = { ...plan, handledUpTo: monthKey(month) };
      this.#execute(plan, tick);
    });
    if (changed !== null) {
      this.#player.savingsPlans = changed;
    }
  }

  #execute(plan: SavingsPlan, tick: Tick): void {
    const depot = this.#depot(plan.depotId);
    const conditions = this.#depotConditions(depot);
    const series = this.#seriesOf(plan.instrumentId);
    const quote = this.#prices.quoteAt(series, tick, tick, conditions.spreadMarkup);
    const fill = savingsPlanFill(plan.amount, quote.ask, conditions.savingsPlanFee);
    const available = this.#ports.available(depot.clearingAccountId);
    const base = {
      tick,
      savingsPlanId: plan.id,
      depotId: plan.depotId,
      instrumentId: plan.instrumentId,
      amount: plan.amount,
    };
    const reason = savingsPlanFailure(plan.amount, fill, {
      atPriceFloor: isAtPriceFloor(quote.mid, this.#priceFloor),
      available,
    });
    if (reason !== null) {
      this.#ports.emit({ type: 'savings-plan-failed', ...base, reason, available });
      return;
    }
    this.#ports.book(
      savingsPlanTransaction(
        plan,
        fill,
        { clearingAccountId: depot.clearingAccountId, bankId: depot.bankId },
        tick,
        quote.mid,
      ),
    );
    bookPurchase(this.#player.positions, plan.depotId, plan.instrumentId, {
      buyTick: tick,
      quantity: fill.quantity,
      cost: fill.total,
    });
    this.#ports.changedDepot(plan.depotId);
    this.#ports.emit({
      type: 'savings-plan-executed',
      ...base,
      quantity: fill.quantity,
      price: fill.price,
      total: fill.total,
    });
  }

  /** `savingsPlanEligible` of a share or ETF, `false` for an index, `null` for an unknown ID. */
  #eligibility(instrumentId: string): boolean | null {
    return this.#eligible.get(instrumentId) ?? (this.#series.has(instrumentId) ? false : null);
  }

  #plan(id: unknown): SavingsPlan | undefined {
    return this.#player.savingsPlans.find((plan) => plan.id === id);
  }

  /** Replaces the plan (a new array, so the projection sees the change). */
  #replace(plan: SavingsPlan, changed: SavingsPlan): void {
    this.#player.savingsPlans = this.#player.savingsPlans.map((candidate) =>
      candidate === plan ? changed : candidate,
    );
  }

  #feeOf(depotId: DepotId): FeeModel {
    return this.#depotConditions(this.#depot(depotId)).savingsPlanFee;
  }

  #seriesOf(instrumentId: string): number {
    const series = this.#series.get(instrumentId);
    if (series === undefined) {
      throw new RangeError(`SavingsPlanSystem: unknown instrument ${instrumentId}`);
    }
    return series;
  }

  #hoursOf(instrumentId: string): TradingHours {
    const hours = this.#hours[this.#seriesOf(instrumentId)];
    if (hours === null) {
      throw new RangeError(`SavingsPlanSystem: ${instrumentId} is not tradable`);
    }
    return hours;
  }

  #depot(id: DepotId): Depot {
    const depot = this.#player.depots.find((candidate) => candidate.id === id);
    if (depot === undefined) {
      throw new RangeError(`SavingsPlanSystem: unknown depot ${id}`);
    }
    return depot;
  }

  #depotConditions(depot: Depot): DepotConditions {
    const conditions = this.#conditions.get(depot.bankId);
    if (conditions === undefined) {
      throw new RangeError(`SavingsPlanSystem: unknown bank ${depot.bankId}`);
    }
    return conditions;
  }
}

/** The fields of a spec, or `null` when one is missing or mistyped (`invalid-command`). */
function savingsPlanSpec(value: unknown): SavingsPlanSpec | null {
  // Primitives have none of the fields; only `null` and `undefined` cannot be destructured.
  const { depotId, instrumentId, amount, day } = (value ?? {}) as Record<string, unknown>;
  return typeof depotId === 'string' &&
    typeof instrumentId === 'string' &&
    typeof amount === 'number' &&
    typeof day === 'number'
    ? { depotId: depotId as DepotId, instrumentId, amount, day }
    : null;
}

function savingsPlanChange(value: unknown): SavingsPlanChange | null {
  const { amount, day } = (value ?? {}) as Record<string, unknown>;
  return typeof amount === 'number' && typeof day === 'number' ? { amount, day } : null;
}

/** Copy of a plan that shares nothing mutable with it (snapshots, TS §9.2). */
export function copySavingsPlan(plan: Readonly<SavingsPlan>): SavingsPlan {
  return { ...plan };
}
