import { accountId, accountNumber, depotId } from '@app/banking/domain/account-logic';
import { AccountId, AccountKind, ClearingAccount } from '@app/banking/domain/models/account.model';
import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { openAccount, registerAccount } from '../banking-system';
import { GameEngine } from '../game-engine';
import { GameSnapshot, GameState, StartConditions } from '../models/game-state.model';
import { GameWorld } from '../models/game-world.model';

const TEST_DEPOT: DepotConditions = {
  custodyFee: { kind: 'none' },
  orderFee: { kind: 'flat', amount: 490 },
  exchangeFee: 0,
  savingsPlanFee: { kind: 'free' },
  clearingAccountRate: 0.015,
  clearingAccountDebitRate: 0.09,
  venue: 'exchange',
  spreadMarkup: 0,
  fractionalShares: false,
};

/**
 * Banks with the conditions of the examples in TS §7.3 and §7.4: `b1` is the home bank (first
 * branch bank) with 12,00 € a month and no waiver, `b2` charges 9,90 € unless 700 € came in and
 * pays savings interest quarterly, `b3` is a broker. Overdraft 11 % plus 4 points above the limit,
 * limit factor 2, savings 2 %, clearing accounts 1,5 % credit and 9 % debit.
 */
export const TEST_BANKS: readonly Bank[] = [
  {
    id: 'b1',
    name: 'Testbank Filiale',
    type: 'branch',
    conditions: {
      currentAccount: {
        monthlyFee: 1_200,
        overdraft: { limitIncomeFactor: 2, rate: 0.11, toleratedSurcharge: 0.04 },
      },
      savingsAccount: { rate: 0.02, payout: 'monthly' },
      depot: TEST_DEPOT,
    },
  },
  {
    id: 'b2',
    name: 'Testbank Direkt',
    type: 'direct',
    conditions: {
      currentAccount: {
        monthlyFee: 990,
        feeWaiver: { minMonthlyDeposits: 70_000 },
        overdraft: { limitIncomeFactor: 2, rate: 0.11, toleratedSurcharge: 0.04 },
      },
      savingsAccount: { rate: 0.02, payout: 'quarterly' },
      depot: TEST_DEPOT,
    },
  },
  {
    id: 'b3',
    name: 'Testbroker',
    type: 'online-broker',
    conditions: { currentAccount: null, savingsAccount: null, depot: TEST_DEPOT },
  },
];

/** `world` with the test banks instead of its own. */
export function withTestBanks(world: GameWorld): GameWorld {
  return { ...world, world: { ...world.world, banks: TEST_BANKS } };
}

/** A new game with the test banks; the start runs the prehistory, so call it in `beforeAll`. */
export function startBankingGame(world: GameWorld, start: StartConditions): GameEngine {
  return GameEngine.start(withTestBanks(world), start);
}

export interface TestAccount {
  kind: AccountKind;
  bankId: string;
  balance?: Cents;
}

export interface TestBooks {
  /** Opened in this order at the snapshot's tick; a clearing account gets its depot after it. */
  accounts?: readonly TestAccount[];
  /** Balances to set, also of existing accounts. */
  balances?: Readonly<Record<AccountId, Cents>>;
  salaryAccountId?: AccountId;
}

/**
 * A copy of `snapshot` with more accounts, other balances or another salary account, until the bank
 * commands exist (AP 3.3). Balances are set without transactions, so the journal no longer sums to
 * them.
 */
export function withBooks(snapshot: GameSnapshot, books: TestBooks): GameSnapshot {
  const state = structuredClone(snapshot) as GameState;
  const { player } = state;
  for (const { kind, bankId, balance } of books.accounts ?? []) {
    let id: AccountId;
    if (kind === 'clearing') {
      const sequence = player.accountSequence + 1;
      const account: ClearingAccount = {
        id: accountId(sequence),
        kind,
        bankId,
        number: accountNumber(sequence),
        openedAt: state.tick,
        closedAt: null,
        depotId: depotId(sequence + 1),
      };
      player.accountSequence = sequence + 1;
      registerAccount(player, account);
      player.depots.push({
        id: account.depotId,
        bankId,
        clearingAccountId: account.id,
        number: accountNumber(sequence + 1),
        openedAt: state.tick,
        closedAt: null,
      });
      id = account.id;
    } else {
      id = openAccount(player, kind, bankId, state.tick).id;
    }
    player.balances.set(id, balance ?? 0);
  }
  for (const [id, balance] of Object.entries(books.balances ?? {})) {
    player.balances.set(id as AccountId, balance);
  }
  if (books.salaryAccountId !== undefined) {
    player.salaryAccountId = books.salaryAccountId;
  }
  return state;
}
