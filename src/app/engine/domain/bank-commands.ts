import {
  closingBlockers,
  closingTargetError,
  findAccount,
  openAccountError,
  openAccountIdError,
  salaryAccountError,
  transferError,
} from '@app/banking/domain/bank-command-logic';
import { Account, AccountId, DepotId } from '@app/banking/domain/models/account.model';
import {
  BankCommandError,
  ClosingBooking,
  ClosingPreview,
} from '@app/banking/domain/models/bank-command.model';
import { BankConditions } from '@app/banking/domain/models/bank-conditions.model';
import { TransactionDraft } from '@app/banking/domain/models/ledger.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { BankingSystem, openAccount, openDepot } from './banking-system';
import {
  CloseAccountCommand,
  CommandResult,
  OpenAccountCommand,
  SetSalaryAccountCommand,
  TransferCommand,
} from './models/engine-command.model';
import { PlayerState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';

/** A closing preview, or why the account cannot be previewed (unknown or already closed). */
export type ClosingPreviewResult =
  { ok: true; preview: ClosingPreview } | { ok: false; error: BankCommandError };

/**
 * The bank commands of the player (TS §7.4, §8.2; US-BK-02 to US-BK-05): they check with the pure
 * rules of `bank-command-logic.ts` and book through the banking system, so that events, monthly
 * values and inflows follow every posting. A rejected command changes nothing.
 */
export class BankCommands {
  readonly #conditions: ReadonlyMap<string, BankConditions>;
  readonly #player: PlayerState;
  readonly #banking: BankingSystem;
  readonly #changed: (id: AccountId) => void;

  constructor(
    world: GameWorld,
    player: PlayerState,
    banking: BankingSystem,
    changed: (id: AccountId) => void,
  ) {
    this.#conditions = new Map(world.world.banks.map((bank) => [bank.id, bank.conditions]));
    this.#player = player;
    this.#banking = banking;
    this.#changed = changed;
  }

  /** Opens an account, or a depot with its clearing account, at once and free of charge (E-17). */
  openAccount({ bankId, kind }: OpenAccountCommand, tick: Tick): CommandResult {
    const error = openAccountError(this.#conditions.get(bankId), kind);
    if (error !== null) {
      return { ok: false, error };
    }
    let opened: { accountId: AccountId; depotId: DepotId | null };
    if (kind === 'depot') {
      const { account, depot } = openDepot(this.#player, bankId, tick);
      opened = { accountId: account.id, depotId: depot.id };
    } else {
      opened = { accountId: openAccount(this.#player, kind, bankId, tick).id, depotId: null };
    }
    this.#changed(opened.accountId);
    return { ok: true, opened };
  }

  /**
   * Closes an account (TS §7.4, US-BK-03): the bank settles it, a remainder goes to the target
   * account, and a clearing account closes with its depot. Atomic: if the balance after the
   * settlement would be negative, or anything else blocks, nothing is booked.
   */
  closeAccount({ accountId, targetAccountId }: CloseAccountCommand, tick: Tick): CommandResult {
    const checked = this.#closing(accountId, tick);
    if (!checked.ok) {
      return checked;
    }
    const { account, preview } = checked;
    const error =
      preview.blockers[0] ??
      closingTargetError(this.#player.accounts, account.id, targetAccountId, preview.remainder);
    if (error !== null) {
      return { ok: false, error };
    }
    this.#banking.settleAccount(account.id, tick);
    if (preview.remainder > 0) {
      this.#banking.book({
        tick,
        type: 'transfer',
        postings: [
          { account: account.id, amount: -preview.remainder },
          { account: targetAccountId as AccountId, amount: preview.remainder },
        ],
        refs: { closedAccountId: account.id },
      });
    }
    account.closedAt = tick;
    for (const depot of this.#player.depots) {
      if (depot.clearingAccountId === account.id) {
        depot.closedAt = tick;
      }
    }
    this.#player.overdraftLimits = this.#player.overdraftLimits.filter(
      (entry) => entry.accountId !== account.id,
    );
    this.#changed(account.id);
    return { ok: true };
  }

  /**
   * What closing the account now would book, and what blocks it (TS §7.4, PS §10.1). Books
   * nothing; `closeAccount` at the same tick books exactly this.
   */
  closingPreview(accountId: string, tick: Tick): ClosingPreviewResult {
    const checked = this.#closing(accountId, tick);
    return checked.ok ? { ok: true, preview: checked.preview } : checked;
  }

  /**
   * Chooses the salary account (US-BK-05): salary and living costs go there from the next bank run
   * on; the overdraft limits follow the salary over three months (TS §7.4).
   */
  setSalaryAccount({ accountId }: SetSalaryAccountCommand): CommandResult {
    const error = salaryAccountError(this.#player.accounts, accountId);
    if (error !== null) {
      return { ok: false, error };
    }
    const previous = this.#player.salaryAccountId;
    if (previous !== accountId) {
      this.#player.salaryAccountId = accountId;
      this.#changed(previous);
      this.#changed(accountId);
    }
    return { ok: true };
  }

  /** Own transfer (US-BK-04, E-17): at once and free, up to the available amount. */
  transfer(command: TransferCommand, tick: Tick): CommandResult {
    const error = transferError(this.#player.accounts, command, (account) =>
      this.#banking.available(account.id),
    );
    if (error !== null) {
      return { ok: false, error };
    }
    this.#banking.book({
      tick,
      type: 'transfer',
      postings: [
        { account: command.fromAccountId, amount: -command.amount },
        { account: command.toAccountId, amount: command.amount },
      ],
      params: { purpose: command.purpose },
    });
    return { ok: true };
  }

  #closing(
    accountId: string,
    tick: Tick,
  ):
    | { ok: true; account: Account; preview: ClosingPreview }
    | { ok: false; error: BankCommandError } {
    const error = openAccountIdError(this.#player.accounts, accountId);
    if (error !== null) {
      return { ok: false, error };
    }
    const account = findAccount(this.#player.accounts, accountId) as Account;
    const settlement = this.#banking.settlement(account.id, tick);
    const preview: ClosingPreview = {
      bookings: [...settlement.credits, ...settlement.charges].map((draft) =>
        closingBooking(draft, account.id),
      ),
      remainder: settlement.balance,
      blockers: closingBlockers({
        isSalaryAccount: account.id === this.#player.salaryAccountId,
        depotEmpty: this.#depotIsEmpty(account),
        remainder: settlement.balance,
      }),
    };
    return { ok: true, account, preview };
  }

  /**
   * Whether the depot of a clearing account holds no positions, open orders or savings plans; true
   * for other accounts. Depots get contents in M5; until then they are empty.
   */
  #depotIsEmpty(_account: Account): boolean {
    return true;
  }
}

function closingBooking(draft: TransactionDraft, accountId: AccountId): ClosingBooking {
  let amount: Cents = 0;
  for (const posting of draft.postings) {
    if (posting.account === accountId) {
      amount += posting.amount;
    }
  }
  const booking: ClosingBooking = { type: draft.type, amount };
  return draft.params === undefined ? booking : { ...booking, params: draft.params };
}
