import { issuerAccount } from '@app/banking/domain/ledger-logic';
import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
import { Transaction, TransactionDraft } from '@app/banking/domain/models/ledger.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { seriesIds, seriesRef } from '@app/market/domain/series';
import {
  distributionAmount,
  distributionPaymentTick,
  pendingDistributionsFor,
} from '@app/portfolio/domain/distribution-logic';
import { PendingDistribution } from '@app/portfolio/domain/models/distribution.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { addDistribution } from '@app/trading/domain/position-logic';

import { EngineEvent } from './models/engine-event.model';
import { PlayerState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { ExDividend } from './models/scheduled-task.model';

/** Where the distribution system delivers its results; the engine wires them. */
export interface DistributionPorts {
  /** Books a credit through the banking system (monthly values, coverage events). */
  book(draft: TransactionDraft): Transaction;
  emit(event: EngineEvent): void;
  /** Schedules the task `distribution-payment` at `tick`. */
  schedulePayment(tick: Tick): void;
  /** A depot whose positions changed (the payouts they earned). */
  changedDepot(id: DepotId): void;
  /** Hook for the tax on a payout (TS §7.7); see `OrderPorts.taxCapitalIncome`. */
  taxCapitalIncome(tick: Tick, accountId: AccountId, income: Cents): Cents;
}

/**
 * Dividends and fund distributions of the player's holdings (TS §6.5, §7.4; US-PF-06): at the open
 * of an ex-date the holdings earn the payout (the shares then are those at the previous close, since
 * nothing trades in between), and at 06:00 of the payment date it is credited to the depot's
 * clearing account, or to the target chosen when that account closed in the meantime. Without tax
 * until AP 5.3 (`taxCapitalIncome`).
 */
export class DistributionSystem {
  readonly #player: PlayerState;
  readonly #ports: DistributionPorts;
  readonly #ids: readonly string[];
  /** Whether a series is an ETF (its payouts are fund distributions). */
  readonly #funds: readonly boolean[];

  constructor(world: GameWorld, player: PlayerState, ports: DistributionPorts) {
    this.#player = player;
    this.#ports = ports;
    this.#ids = seriesIds(world.context);
    this.#funds = this.#ids.map((_id, series) => seriesRef(world.context, series).kind === 'etf');
  }

  /**
   * Ex-dates at the open of an exchange: every holding of the instruments earns its payout. The
   * open runs before the orders of its tick, so a purchase at the open earns nothing and a sale on
   * the ex-date still earns it.
   */
  exDate(tick: Tick, dividends: readonly ExDividend[]): void {
    const { positions, depots, pendingDistributions } = this.#player;
    for (const { series, cents, paymentDay } of dividends) {
      const instrumentId = this.#ids[series];
      const kind = this.#funds[series] ? 'fund-distribution' : 'dividend';
      for (const position of positions) {
        if (position.instrumentId !== instrumentId) {
          continue;
        }
        const amount = distributionAmount(position.quantity, cents);
        if (amount <= 0) {
          continue;
        }
        const depot = depots.find((candidate) => candidate.id === position.depotId);
        if (depot === undefined) {
          throw new RangeError(`DistributionSystem: unknown depot ${position.depotId}`);
        }
        const paymentTick = distributionPaymentTick(paymentDay);
        if (!pendingDistributions.some((pending) => pending.paymentTick === paymentTick)) {
          this.#ports.schedulePayment(paymentTick);
        }
        pendingDistributions.push({
          kind,
          depotId: depot.id,
          instrumentId,
          accountId: depot.clearingAccountId,
          quantity: position.quantity,
          cents,
          amount,
          exTick: tick,
          paymentTick,
        });
        addDistribution(positions, depot.id, instrumentId, amount);
        this.#ports.changedDepot(depot.id);
      }
    }
  }

  /** Task `distribution-payment`: credits every payout due by `tick` in ex-date order. */
  pay(tick: Tick): void {
    const pending = this.#player.pendingDistributions;
    const due = pending.filter((distribution) => distribution.paymentTick <= tick);
    this.#player.pendingDistributions = pending.filter(
      (distribution) => distribution.paymentTick > tick,
    );
    for (const distribution of due) {
      this.#credit(distribution, tick);
    }
  }

  /** Payouts still to be credited to an account. */
  pendingFor(accountId: AccountId): Cents {
    return pendingDistributionsFor(this.#player.pendingDistributions, accountId);
  }

  /** A closing account passes its pending payouts on to the target of its remainder (TS §7.4). */
  redirect(from: AccountId, to: AccountId): void {
    for (const distribution of this.#player.pendingDistributions) {
      if (distribution.accountId === from) {
        distribution.accountId = to;
      }
    }
  }

  #credit(distribution: PendingDistribution, tick: Tick): void {
    const { kind, accountId, depotId, instrumentId, quantity, cents, amount } = distribution;
    this.#ports.book({
      tick,
      type: kind,
      postings: [
        { account: accountId, amount },
        { account: issuerAccount(instrumentId), amount: -amount },
      ],
      refs: { depotId, instrumentId },
      params: { quantity, cents },
    });
    const tax = this.#ports.taxCapitalIncome(tick, accountId, amount);
    this.#ports.emit({
      type: 'distribution-paid',
      tick,
      kind,
      accountId,
      depotId,
      instrumentId,
      quantity,
      amount,
      tax,
    });
  }
}
