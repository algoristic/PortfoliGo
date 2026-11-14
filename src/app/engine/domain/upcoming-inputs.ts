import { Account, CurrentAccount } from '@app/banking/domain/models/account.model';
import { BankConditions } from '@app/banking/domain/models/bank-conditions.model';
import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import {
  AnnouncedDividend,
  UpcomingHousehold,
  UpcomingInputs,
} from '@app/dashboard/domain/models/upcoming.model';
import { paymentDay } from '@app/market/domain/dividend-logic';
import { seriesRef } from '@app/market/domain/series';
import { distributionPaymentTick } from '@app/portfolio/domain/distribution-logic';

import { InstrumentSessions } from './instrument-sessions';
import { GameState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';

/**
 * What „Demnächst“ needs from the state (TS §8.1, E-05), read without running anything ahead: the
 * start conditions' base amounts, the open current accounts with their fee conditions and
 * deposits, the open depots with their custody fee, the ex-dates the market state has announced
 * for held shares, ex-dates of today whose opening is still scheduled, and the pending payouts.
 */
export function upcomingInputs(
  world: GameWorld,
  state: Readonly<GameState>,
  sessions: InstrumentSessions,
): UpcomingInputs {
  return {
    household: household(world, state),
    announcedDividends: announcedDividends(world, state, sessions),
    pendingDistributions: state.player.pendingDistributions.map((pending) => ({ ...pending })),
  };
}

function household(world: GameWorld, state: Readonly<GameState>): UpcomingHousehold {
  const { player } = state;
  const conditions = new Map<string, BankConditions>(
    world.world.banks.map((bank) => [bank.id, bank.conditions]),
  );
  const open = (account: Account): boolean => account.closedAt === null;
  return {
    netIncome: player.start.netIncome,
    livingCosts: player.start.livingCosts,
    salaryAccountId: player.salaryAccountId,
    currentAccounts: player.accounts
      .filter((account): account is CurrentAccount => account.kind === 'current' && open(account))
      .flatMap((account) => {
        const current = conditions.get(account.bankId)?.currentAccount;
        const inflows = player.inflows.find((entry) => entry.accountId === account.id);
        return current === undefined || current === null || inflows === undefined
          ? []
          : [
              {
                accountId: account.id,
                openedAt: account.openedAt,
                conditions: current,
                depositsLastMonth: inflows.depositsLastMonth,
                depositsThisMonth: inflows.depositsThisMonth,
              },
            ];
      }),
    depots: player.depots
      .filter((depot) => depot.closedAt === null)
      .flatMap((depot) => {
        const bank = conditions.get(depot.bankId);
        return bank === undefined
          ? []
          : [
              {
                depotId: depot.id,
                clearingAccountId: depot.clearingAccountId,
                custodyFee: bank.depot.custodyFee,
              },
            ];
      }),
  };
}

/**
 * Ex-dates for the held positions: today's (shares and ETFs) from the scheduled openings, which
 * carry the amount; later ones of shares once the market state holds their announced amount.
 * ETF distributions are never announced ahead (TS §6.5).
 */
function announcedDividends(
  world: GameWorld,
  state: Readonly<GameState>,
  sessions: InstrumentSessions,
): AnnouncedDividend[] {
  const { context } = world;
  const result: AnnouncedDividend[] = [];
  const positions = state.player.positions.filter(
    (position) => !isClosedDepot(state, position.depotId),
  );
  const today = state.scheduler.heap.flatMap((task) =>
    task.kind === 'session-open' ? task.dividends.map((dividend) => ({ task, dividend })) : [],
  );
  for (const position of positions) {
    const series = sessions.series.get(position.instrumentId);
    if (series === undefined) {
      continue;
    }
    for (const { task, dividend } of today) {
      if (dividend.series === series) {
        result.push({
          depotId: position.depotId,
          instrumentId: position.instrumentId,
          quantity: position.quantity,
          cents: dividend.cents,
          exTick: task.tick,
          paymentTick: distributionPaymentTick(dividend.paymentDay),
        });
      }
    }
    const hours = sessions.hours[series];
    if (seriesRef(context, series).kind !== 'stock' || hours === null) {
      continue;
    }
    const exDay = state.market.nextExDay[series];
    const cents = state.market.dividendCents[series];
    if (exDay >= 0 && !Number.isNaN(cents) && cents > 0) {
      result.push({
        depotId: position.depotId,
        instrumentId: position.instrumentId,
        quantity: position.quantity,
        cents,
        exTick: dayStartTick(exDay) + hours.open * TICKS_PER_MINUTE,
        paymentTick: distributionPaymentTick(paymentDay(exDay)),
      });
    }
  }
  return result;
}

function isClosedDepot(state: Readonly<GameState>, depotId: string): boolean {
  return state.player.depots.some((depot) => depot.id === depotId && depot.closedAt !== null);
}
