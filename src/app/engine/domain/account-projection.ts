import { AccountId } from '@app/banking/domain/models/account.model';
import { availableAfterReservations } from '@app/banking/domain/overdraft-logic';
import { Cents } from '@app/shared/domain/models/money.model';
import { reservedAmount } from '@app/trading/domain/order-reservation-logic';

import { AccountView } from './models/account-view.model';
import { PlayerState } from './models/game-state.model';

/**
 * Views of the player's accounts in account order (TS §8.3, §8.4): all of them, or only those in
 * `ids` (the changed ones).
 */
export function accountViews(
  player: Readonly<PlayerState>,
  ids?: readonly AccountId[],
): AccountView[] {
  const wanted = ids === undefined ? null : new Set(ids);
  const limits = new Map(player.overdraftLimits.map((entry) => [entry.accountId, entry.limit]));
  const views: AccountView[] = [];
  for (const account of player.accounts) {
    if (wanted !== null && !wanted.has(account.id)) {
      continue;
    }
    const open = account.closedAt === null;
    const balance = player.balances.get(account.id) ?? 0;
    const overdraftLimit =
      open && account.kind === 'current' ? (limits.get(account.id) ?? 0) : null;
    const depot = player.depots.find((candidate) => candidate.clearingAccountId === account.id);
    views.push({
      id: account.id,
      kind: account.kind,
      bankId: account.bankId,
      number: account.number,
      depot: depot === undefined ? null : { id: depot.id, number: depot.number },
      openedAt: account.openedAt,
      closedAt: account.closedAt,
      balance,
      overdraftLimit,
      available: open
        ? availableAfterReservations(
            { balance, limit: overdraftLimit },
            account.kind === 'clearing' ? reservedAmount(player.orders, account.depotId) : 0,
          )
        : 0,
      salaryAccount: account.id === player.salaryAccountId,
    });
  }
  return views;
}

/** Net worth (TS §7.9): the sum of the account balances; positions follow with M5. */
export function netWorth(player: Readonly<PlayerState>): Cents {
  let sum = 0;
  for (const balance of player.balances.values()) {
    sum += balance;
  }
  return sum;
}
