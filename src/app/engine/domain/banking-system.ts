import { closingAccountFees, monthlyAccountFee } from '@app/banking/domain/account-fee-logic';
import { accountId, accountNumber, depotId } from '@app/banking/domain/account-logic';
import {
  bankRunPlan,
  isInterestPayoutDue,
  monthKey,
  monthOf,
  previousMonth,
  startsQuarter,
} from '@app/banking/domain/bank-run-logic';
import {
  accrueCustodyDay,
  closeCustodyQuarter,
  closingCustodyFees,
  openCustodyAccrual,
  quarterCustodyFee,
} from '@app/banking/domain/custody-fee-logic';
import { closeInflowMonth, openInflows, recordInflows } from '@app/banking/domain/inflow-logic';
import {
  bookedInterest,
  clearingAccountDailyInterest,
  dailyInterest,
  overdraftDailyInterest,
} from '@app/banking/domain/interest-logic';
import {
  bankFeesAccount,
  bankInterestAccount,
  bookTransaction,
  EMPLOYER_ACCOUNT,
  LIVING_COSTS_ACCOUNT,
  TAX_OFFICE_ACCOUNT,
} from '@app/banking/domain/ledger-logic';
import { livingCosts } from '@app/banking/domain/living-costs-logic';
import {
  Account,
  AccountId,
  AccountKind,
  ClearingAccount,
  Depot,
} from '@app/banking/domain/models/account.model';
import {
  BankConditions,
  CurrentAccountConditions,
  SavingsAccountConditions,
} from '@app/banking/domain/models/bank-conditions.model';
import {
  AccountInflows,
  BankRunPlan,
  CalendarMonth,
  CoverageState,
  CustodyAccrual,
  CustodyFeeCharge,
  InterestAccrual,
} from '@app/banking/domain/models/household.model';
import { Transaction, TransactionDraft } from '@app/banking/domain/models/ledger.model';
import { StandingOrder } from '@app/banking/domain/models/standing-order.model';
import {
  addTerCosts,
  addToMonthlyValues,
  emptyMonthlyValues,
} from '@app/banking/domain/monthly-values-logic';
import {
  accountEvents,
  availableAfterReservations,
  overdraftLimits,
} from '@app/banking/domain/overdraft-logic';
import { canExecute, dueMonth } from '@app/banking/domain/standing-order-logic';
import { Tick, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { SeedKey } from '@app/simulation/util/seed';
import { TaxableIncomeKind, TaxYear } from '@app/taxes/domain/models/tax.model';
import { assessTaxableIncome, closeTaxYear, taxTransactionType } from '@app/taxes/domain/tax-logic';
import { reservedAmount } from '@app/trading/domain/order-reservation-logic';

import { EngineEvent } from './models/engine-event.model';
import { PlayerState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';

/** The part of the player state that opening an account changes. */
export type AccountBooks = Pick<
  PlayerState,
  'accounts' | 'balances' | 'accountSequence' | 'overdraftLimits' | 'inflows' | 'interest'
>;

/** The part of the player state that opening a depot changes. */
export type DepotBooks = AccountBooks & Pick<PlayerState, 'depots' | 'custody'>;

/** Where the banking system delivers its results; the engine buffers them. */
export interface BankingPorts {
  /** Every booked transaction, in journal order. */
  journal(transaction: Transaction): void;
  emit(event: EngineEvent): void;
  /**
   * An account whose projection changed (TS §8.4): a posting, a new limit, opening, closing or the
   * salary flag. Called once per change; the engine collects the IDs for the host.
   */
  changed?(accountId: AccountId): void;
}

/**
 * What closing an account books (TS §7.4), computed without booking: the credit interest with its
 * tax, then the fees and the debit interest, each a transaction on the account.
 */
export interface AccountSettlement {
  credits: TransactionDraft[];
  charges: TransactionDraft[];
  /** Tax year after the credit interest. */
  taxYear: TaxYear;
  /** Credit interest and its tax for `interest-credited`; `null` without credit interest. */
  credited: { amount: Cents; tax: Cents } | null;
  /** Balance after all bookings. */
  balance: Cents;
}

/**
 * Opens a current account or a savings account with the next number of the shared counter
 * (TS §7.2) and registers it (`registerAccount`).
 */
export function openAccount(
  books: AccountBooks,
  kind: Exclude<AccountKind, 'clearing'>,
  bankId: string,
  tick: Tick,
): Account {
  const sequence = books.accountSequence + 1;
  const account: Account = {
    id: accountId(sequence),
    kind,
    bankId,
    number: accountNumber(sequence),
    openedAt: tick,
    closedAt: null,
  };
  books.accountSequence = sequence;
  registerAccount(books, account);
  return account;
}

/**
 * Opens a depot with its clearing account (US-BK-02): the account takes the next number of the
 * shared counter, the depot the one after it (TS §7.2).
 */
export function openDepot(
  books: DepotBooks,
  bankId: string,
  tick: Tick,
): { account: ClearingAccount; depot: Depot } {
  const sequence = books.accountSequence + 1;
  const account: ClearingAccount = {
    id: accountId(sequence),
    kind: 'clearing',
    bankId,
    number: accountNumber(sequence),
    openedAt: tick,
    closedAt: null,
    depotId: depotId(sequence + 1),
  };
  const depot: Depot = {
    id: account.depotId,
    bankId,
    clearingAccountId: account.id,
    number: accountNumber(sequence + 1),
    openedAt: tick,
    closedAt: null,
  };
  books.accountSequence = sequence + 1;
  registerAccount(books, account);
  books.depots.push(depot);
  books.custody.push(openCustodyAccrual(depot.id));
  return { account, depot };
}

/**
 * Adds an opened account to the books: balance 0, no accrued interest, and for a current account
 * empty inflows; its limit is 0 until the next bank run sets one (TS §7.4). Clearing accounts come
 * with their depot, whose number the caller draws from the same counter.
 */
export function registerAccount(books: AccountBooks, account: Account): void {
  books.accounts.push(account);
  books.balances.set(account.id, 0);
  books.interest.push({
    accountId: account.id,
    credit: 0,
    debit: 0,
    pendingCredit: 0,
    pendingDebit: 0,
  });
  if (account.kind === 'current') {
    books.inflows.push(openInflows(account.id));
  }
}

/**
 * Banking system of the engine (TS §3.8, §7.4): books transactions with their side effects
 * (inflows, monthly values, coverage events), accrues interest at the day change, runs the bank
 * run at 06:00 and closes months and tax years. It works on the engine's player state.
 */
export class BankingSystem {
  readonly #seedKey: SeedKey;
  readonly #conditions: ReadonlyMap<string, BankConditions>;
  readonly #player: PlayerState;
  readonly #ports: BankingPorts;

  constructor(world: GameWorld, player: PlayerState, ports: BankingPorts) {
    this.#seedKey = world.seedKey;
    this.#conditions = new Map(world.world.banks.map((bank) => [bank.id, bank.conditions]));
    this.#player = player;
    this.#ports = ports;
  }

  /**
   * Books a transaction on the balances (TS §7.2), adds it to the inflows and the monthly values
   * (TS §7.4) and reports accounts it uncovers or takes beyond their limit.
   */
  book(draft: TransactionDraft): Transaction {
    const player = this.#player;
    const transaction = bookTransaction(player.balances, player.nextTransactionSeq, draft);
    player.nextTransactionSeq++;
    player.inflows = recordInflows(player.inflows, transaction);
    player.monthlyValues = addToMonthlyValues(player.monthlyValues, transaction);
    this.#ports.journal(transaction);
    for (const { account, amount, balanceAfter } of transaction.postings) {
      // Only postings on player accounts carry a balance.
      if (balanceAfter !== null) {
        const id = account as AccountId;
        this.#ports.changed?.(id);
        const limit = this.#limitOf(this.#account(id));
        this.#coverage(
          transaction.tick,
          id,
          { balance: balanceAfter - amount, limit },
          { balance: balanceAfter, limit },
        );
      }
    }
    return transaction;
  }

  /**
   * Interest of the day that just ended on the balances at its end (TS §3.8, §7.3): called at the
   * day change before anything is booked on the new day, for every calendar day and open account.
   */
  accrueInterest(): void {
    const { accounts, balances } = this.#player;
    for (const account of accounts) {
      if (account.closedAt !== null) {
        continue;
      }
      const interest = this.#dailyInterest(account, balances.get(account.id) ?? 0);
      if (interest > 0) {
        this.#accrual(account.id).credit += interest;
      } else {
        this.#accrual(account.id).debit += interest;
      }
    }
  }

  /**
   * End-of-day values of the day that just ended for the custody fee (TS §7.3, §7.4): called at the
   * day change for every open depot, with `valueOf` giving the depot's value then.
   */
  accrueCustody(valueOf: (depot: Readonly<Depot>) => Cents): void {
    for (const depot of this.#player.depots) {
      if (depot.closedAt === null) {
        accrueCustodyDay(this.#custody(depot.id), valueOf(depot));
      }
    }
  }

  /** Adds the estimated TER costs of the day that ended to the running month (US-PF-07). */
  accrueTerCosts(cents: number): void {
    this.#player.monthlyValues = addTerCosts(this.#player.monthlyValues, cents);
  }

  /** The bank run at 06:00 (TS §7.4, E-19): the steps of `bankRunPlan` in their order. */
  runBank(tick: Tick): void {
    const plan = bankRunPlan(tick, this.#player.standingOrders);
    for (const step of plan.steps) {
      switch (step) {
        case 'overdraft-limits':
          this.updateLimits(tick);
          break;
        case 'salary':
          this.#paySalary(tick, plan.month);
          break;
        case 'credit-interest':
          this.#creditInterest(tick, plan);
          break;
        case 'living-costs':
          this.#chargeLivingCosts(tick, plan.month);
          break;
        case 'account-fee':
          this.#chargeAccountFees(tick, plan.settledMonth);
          break;
        case 'custody-fee':
          this.#chargeCustodyFees(tick, plan.settledMonth);
          break;
        case 'overdraft-interest':
          this.#chargeDebitInterest(tick, 'current', plan.settledMonth);
          break;
        case 'debit-interest':
          this.#chargeDebitInterest(tick, 'clearing', plan.settledMonth);
          break;
        case 'standing-orders':
          this.#executeStandingOrders(tick);
          break;
      }
    }
  }

  /**
   * Sets the limits of all open current accounts from the salary window (TS §7.4, E-17) and reports
   * accounts that a cut limit takes beyond it.
   */
  updateLimits(tick: Tick): void {
    const player = this.#player;
    const limits = overdraftLimits(
      player.accounts,
      player.inflows,
      player.salaryAccountId,
      (bankId) => this.#currentAccountConditions(bankId).overdraft.limitIncomeFactor,
    );
    const changes = limits.map(({ accountId: id, limit }) => ({
      id,
      balance: player.balances.get(id) ?? 0,
      previous: this.#limitOf(this.#account(id)),
      limit,
    }));
    player.overdraftLimits = limits;
    for (const { id, balance, previous, limit } of changes) {
      if (limit !== previous) {
        this.#ports.changed?.(id);
      }
      this.#coverage(tick, id, { balance, limit: previous }, { balance, limit });
    }
  }

  /**
   * Month end at 00:00 of the next month (TS §7.4), after the day change has accrued the month's
   * last day: the monthly values become a closed month, the salary window moves on, and the
   * month's interest waits for the bank run that settles it.
   */
  closeMonth(tick: Tick): void {
    const player = this.#player;
    player.closedMonths.push({
      month: monthOf(tick - TICKS_PER_MINUTE),
      values: player.monthlyValues,
    });
    player.monthlyValues = emptyMonthlyValues();
    player.inflows = closeInflowMonth(player.inflows);
    for (const accrual of player.interest) {
      accrual.pendingCredit += accrual.credit;
      accrual.pendingDebit += accrual.debit;
      accrual.credit = 0;
      accrual.debit = 0;
    }
    if (startsQuarter(monthOf(tick))) {
      for (const accrual of player.custody) {
        closeCustodyQuarter(accrual);
      }
    }
  }

  /** Year end at 00:00 of 1 January (TS §7.7): the closed year joins the history (US-ST-04). */
  closeYear(): void {
    const player = this.#player;
    player.closedTaxYears.push(player.taxYear);
    player.taxYear = closeTaxYear(player.taxYear);
  }

  /**
   * Tax on capital income other than credit interest (TS §7.7): a sale's realized gain (losses
   * negative) or a dividend or fund distribution, called right after its booking. Books the
   * withholding (`tax`) or refund (`tax-refund`) against the tax office on `accountId`, the account
   * of the triggering event, with the event's references, and returns it (refunds negative, 0
   * without booking).
   */
  taxCapitalIncome(
    tick: Tick,
    accountId: AccountId,
    income: Cents,
    kind: Exclude<TaxableIncomeKind, 'interest'>,
    refs?: Readonly<Record<string, string>>,
  ): Cents {
    const player = this.#player;
    const { state, delta } = assessTaxableIncome(player.taxYear, income, kind);
    player.taxYear = state;
    const draft = taxDraft(tick, accountId, delta);
    if (draft !== null) {
      this.book(refs === undefined ? draft : { ...draft, refs });
    }
    return delta;
  }

  /** Balance and limit of an account (TS §7.4); the limit is `null` except for current accounts. */
  coverage(id: AccountId): CoverageState {
    return { balance: this.#player.balances.get(id) ?? 0, limit: this.#limitOf(this.#account(id)) };
  }

  /**
   * Amount for own transfers (TS §7.4): balance plus free limit, for a clearing account minus the
   * reservations of the active buy orders of its depot (TS §7.5).
   */
  available(id: AccountId): Cents {
    const account = this.#account(id);
    const reserved =
      account.kind === 'clearing' ? reservedAmount(this.#player.orders, account.depotId) : 0;
    return availableAfterReservations(this.coverage(id), reserved);
  }

  /**
   * What an account still earns and owes when it closes at `tick` (TS §7.4), without booking it:
   * the interest accrued up to the day before (credit with its tax first), the account fees up to
   * the closing day, then the debit interest. The closing preview shows it, `settleAccount` books it.
   */
  settlement(id: AccountId, tick: Tick): AccountSettlement {
    const account = this.#account(id);
    const accrual = this.#accrual(id);
    const month = monthOf(tick);
    const credit = bookedInterest(accrual.pendingCredit + accrual.credit);
    const debit = bookedInterest(accrual.pendingDebit + accrual.debit);
    let credits: TransactionDraft[] = [];
    let taxYear = this.#player.taxYear;
    let credited: AccountSettlement['credited'] = null;
    if (credit > 0) {
      const interest = this.#creditDrafts(tick, account, credit, month, month, taxYear);
      credits = interest.drafts;
      taxYear = interest.taxYear;
      credited = { amount: credit, tax: interest.tax };
    }
    const charges: TransactionDraft[] = [];
    if (account.kind === 'current') {
      const fees = closingAccountFees(
        this.#currentAccountConditions(account.bankId),
        account,
        tick,
        this.#inflows(id),
      );
      for (const charge of fees) {
        charges.push(this.#feeDraft(tick, account, charge.amount, charge.month));
      }
    }
    if (account.kind === 'clearing') {
      const custody = this.#bankConditions(account.bankId).depot.custodyFee;
      for (const charge of closingCustodyFees(custody, this.#custody(account.depotId), month)) {
        charges.push(this.#custodyDraft(tick, account, charge));
      }
    }
    if (debit < 0) {
      charges.push(this.#debitDraft(tick, account, debit, month));
    }
    let balance = this.#player.balances.get(id) ?? 0;
    for (const draft of [...credits, ...charges]) {
      for (const posting of draft.postings) {
        if (posting.account === id) {
          balance += posting.amount;
        }
      }
    }
    return { credits, charges, taxYear, credited, balance };
  }

  /**
   * Books the settlement of a closing account (`settlement`) and clears its accrued interest. The
   * caller closes the account afterwards; the closing day itself accrues no interest, because the
   * account is empty at its end.
   */
  settleAccount(id: AccountId, tick: Tick): void {
    const settlement = this.settlement(id, tick);
    const accrual = this.#accrual(id);
    accrual.credit = 0;
    accrual.debit = 0;
    accrual.pendingCredit = 0;
    accrual.pendingDebit = 0;
    const account = this.#account(id);
    if (account.kind === 'clearing') {
      Object.assign(this.#custody(account.depotId), openCustodyAccrual(account.depotId));
    }
    for (const draft of settlement.credits) {
      this.book(draft);
    }
    this.#player.taxYear = settlement.taxYear;
    if (settlement.credited !== null) {
      this.#ports.emit({ type: 'interest-credited', tick, accountId: id, ...settlement.credited });
    }
    for (const draft of settlement.charges) {
      this.book(draft);
    }
  }

  /**
   * The standing orders due today in the order they were created (TS §7.4, AP 5.6a): each one is a
   * `transfer` of its whole amount if the available amount of the source covers it, else it fails
   * with `standing-order-failed`. Either way its month is done.
   */
  #executeStandingOrders(tick: Tick): void {
    const orders = this.#player.standingOrders;
    let changed: StandingOrder[] | null = null;
    orders.forEach((order, index) => {
      const month = dueMonth(order, tick);
      if (month === null) {
        return;
      }
      changed ??= orders.slice();
      changed[index] = { ...order, handledUpTo: monthKey(month) };
      const available = this.available(order.fromAccountId);
      if (!canExecute(order.amount, available)) {
        this.#ports.emit({
          type: 'standing-order-failed',
          tick,
          standingOrderId: order.id,
          fromAccountId: order.fromAccountId,
          toAccountId: order.toAccountId,
          amount: order.amount,
          available,
        });
        return;
      }
      this.book({
        tick,
        type: 'transfer',
        postings: [
          { account: order.fromAccountId, amount: -order.amount },
          { account: order.toAccountId, amount: order.amount },
        ],
        refs: { standingOrderId: order.id },
        params: { purpose: order.purpose },
      });
    });
    if (changed !== null) {
      this.#player.standingOrders = changed;
    }
  }

  #paySalary(tick: Tick, month: CalendarMonth): void {
    const amount = this.#player.start.netIncome;
    if (amount > 0) {
      this.book({
        tick,
        type: 'salary',
        postings: [
          { account: this.#player.salaryAccountId, amount },
          { account: EMPLOYER_ACCOUNT, amount: -amount },
        ],
        params: { month: monthKey(month) },
      });
    }
  }

  /**
   * Credit interest of the settled period on savings and clearing accounts in account order, each
   * followed by its tax (TS §7.4, §7.7). Savings accounts with quarterly payout keep accruing until
   * the first bank working day of a quarter. Current accounts earn no credit interest, and closed
   * accounts were settled when they closed, so their accruals are 0.
   */
  #creditInterest(tick: Tick, plan: BankRunPlan): void {
    for (const account of this.#player.accounts) {
      const payout =
        account.kind === 'savings' ? this.#savingsConditions(account.bankId).payout : 'monthly';
      if (!isInterestPayoutDue(payout, plan.month)) {
        continue;
      }
      const accrual = this.#accrual(account.id);
      const amount = bookedInterest(accrual.pendingCredit);
      accrual.pendingCredit = 0;
      if (amount > 0) {
        const to = plan.settledMonth;
        const from = payout === 'quarterly' ? previousMonth(previousMonth(to)) : to;
        this.#bookCreditInterest(tick, account, amount, from, to);
      }
    }
  }

  /** Credit interest of the months `from` to `to`, then the tax on it on the same account. */
  #bookCreditInterest(
    tick: Tick,
    account: Account,
    amount: Cents,
    from: CalendarMonth,
    to: CalendarMonth,
  ): void {
    const player = this.#player;
    const interest = this.#creditDrafts(tick, account, amount, from, to, player.taxYear);
    for (const draft of interest.drafts) {
      this.book(draft);
    }
    player.taxYear = interest.taxYear;
    this.#ports.emit({
      type: 'interest-credited',
      tick,
      accountId: account.id,
      amount,
      tax: interest.tax,
    });
  }

  /** The credit interest and the tax on it (TS §7.7), with the tax year after them. */
  #creditDrafts(
    tick: Tick,
    account: Account,
    amount: Cents,
    from: CalendarMonth,
    to: CalendarMonth,
    taxYear: TaxYear,
  ): { drafts: TransactionDraft[]; taxYear: TaxYear; tax: Cents } {
    const drafts: TransactionDraft[] = [
      {
        tick,
        type: 'credit-interest',
        postings: [
          { account: account.id, amount },
          { account: bankInterestAccount(account.bankId), amount: -amount },
        ],
        params: { from: monthKey(from), to: monthKey(to) },
      },
    ];
    const { state, delta } = assessTaxableIncome(taxYear, amount, 'interest');
    const tax = taxDraft(tick, account.id, delta);
    if (tax !== null) {
      drafts.push(tax);
    }
    return { drafts, taxYear: state, tax: delta };
  }

  /** Living costs of the month from the salary account, also into the red (TS §7.4). */
  #chargeLivingCosts(tick: Tick, month: CalendarMonth): void {
    const amount = livingCosts(this.#seedKey, this.#player.start.livingCosts, month);
    if (amount > 0) {
      this.book({
        tick,
        type: 'living-costs',
        postings: [
          { account: this.#player.salaryAccountId, amount: -amount },
          { account: LIVING_COSTS_ACCOUNT, amount },
        ],
        params: { month: monthKey(month) },
      });
    }
  }

  /** Fees of the settled month on the open current accounts, by their deposits then (TS §7.4). */
  #chargeAccountFees(tick: Tick, month: CalendarMonth): void {
    for (const account of this.#player.accounts) {
      if (account.kind !== 'current' || account.closedAt !== null) {
        continue;
      }
      const fee = monthlyAccountFee(
        this.#currentAccountConditions(account.bankId),
        account,
        month,
        this.#inflows(account.id).depositsLastMonth,
      );
      if (fee > 0) {
        this.book(this.#feeDraft(tick, account, fee, month));
      }
    }
  }

  #feeDraft(tick: Tick, account: Account, fee: Cents, month: CalendarMonth): TransactionDraft {
    return {
      tick,
      type: 'account-fee',
      postings: [
        { account: account.id, amount: -fee },
        { account: bankFeesAccount(account.bankId), amount: fee },
      ],
      params: { month: monthKey(month) },
    };
  }

  /**
   * Custody fees of the past quarter on the clearing accounts of the open depots (TS §7.3, §7.4),
   * also into the red (E-17). Closed depots were charged when they closed.
   */
  #chargeCustodyFees(tick: Tick, settledMonth: CalendarMonth): void {
    for (const depot of this.#player.depots) {
      const accrual = this.#custody(depot.id);
      const { pendingValueSum, pendingDays } = accrual;
      accrual.pendingValueSum = 0;
      accrual.pendingDays = 0;
      if (depot.closedAt !== null) {
        continue;
      }
      const custody = this.#bankConditions(depot.bankId).depot.custodyFee;
      const charge = quarterCustodyFee(custody, settledMonth, pendingValueSum, pendingDays);
      if (charge.amount > 0) {
        this.book(this.#custodyDraft(tick, this.#account(depot.clearingAccountId), charge));
      }
    }
  }

  #custodyDraft(tick: Tick, account: Account, charge: CustodyFeeCharge): TransactionDraft {
    return {
      tick,
      type: 'custody-fee',
      postings: [
        { account: account.id, amount: -charge.amount },
        { account: bankFeesAccount(account.bankId), amount: charge.amount },
      ],
      params: {
        from: monthKey(charge.from),
        to: monthKey(charge.to),
        days: charge.days,
        averageValue: charge.averageValue,
      },
    };
  }

  /**
   * Overdraft interest (current accounts) or debit interest (clearing accounts) of the month; closed
   * accounts were settled when they closed.
   */
  #chargeDebitInterest(tick: Tick, kind: AccountKind, month: CalendarMonth): void {
    for (const account of this.#player.accounts) {
      if (account.kind !== kind) {
        continue;
      }
      const accrual = this.#accrual(account.id);
      const amount = bookedInterest(accrual.pendingDebit);
      accrual.pendingDebit = 0;
      if (amount < 0) {
        this.book(this.#debitDraft(tick, account, amount, month));
      }
    }
  }

  #debitDraft(tick: Tick, account: Account, amount: Cents, month: CalendarMonth): TransactionDraft {
    return {
      tick,
      type: account.kind === 'current' ? 'overdraft-interest' : 'debit-interest',
      postings: [
        { account: account.id, amount },
        { account: bankInterestAccount(account.bankId), amount: -amount },
      ],
      params: { from: monthKey(month), to: monthKey(month) },
    };
  }

  #dailyInterest(account: Account, balance: Cents): number {
    switch (account.kind) {
      case 'current':
        return overdraftDailyInterest(
          balance,
          this.#limitOf(account) ?? 0,
          this.#currentAccountConditions(account.bankId).overdraft,
        );
      case 'savings':
        return dailyInterest(Math.max(0, balance), this.#savingsConditions(account.bankId).rate);
      case 'clearing':
        return clearingAccountDailyInterest(balance, this.#bankConditions(account.bankId).depot);
    }
  }

  #coverage(tick: Tick, id: AccountId, before: CoverageState, after: CoverageState): void {
    for (const type of accountEvents(before, after)) {
      this.#ports.emit({ type, tick, accountId: id, balance: after.balance, limit: after.limit });
    }
  }

  /** Limit of a current account (0 until a bank run set one), `null` for other accounts. */
  #limitOf(account: Account): Cents | null {
    if (account.kind !== 'current') {
      return null;
    }
    for (const entry of this.#player.overdraftLimits) {
      if (entry.accountId === account.id) {
        return entry.limit;
      }
    }
    return 0;
  }

  #account(id: AccountId): Account {
    for (const account of this.#player.accounts) {
      if (account.id === id) {
        return account;
      }
    }
    throw new RangeError(`BankingSystem: unknown account ${id}`);
  }

  #inflows(id: AccountId): AccountInflows {
    const inflows = this.#player.inflows.find((entry) => entry.accountId === id);
    if (inflows === undefined) {
      throw new RangeError(`BankingSystem: no inflows for ${id}`);
    }
    return inflows;
  }

  #custody(depotId: string): CustodyAccrual {
    for (const accrual of this.#player.custody) {
      if (accrual.depotId === depotId) {
        return accrual;
      }
    }
    throw new RangeError(`BankingSystem: no custody accrual for ${depotId}`);
  }

  #accrual(id: AccountId): InterestAccrual {
    for (const accrual of this.#player.interest) {
      if (accrual.accountId === id) {
        return accrual;
      }
    }
    throw new RangeError(`BankingSystem: no interest accrual for ${id}`);
  }

  #bankConditions(bankId: string): BankConditions {
    const conditions = this.#conditions.get(bankId);
    if (conditions === undefined) {
      throw new RangeError(`BankingSystem: unknown bank ${bankId}`);
    }
    return conditions;
  }

  #currentAccountConditions(bankId: string): CurrentAccountConditions {
    const conditions = this.#bankConditions(bankId).currentAccount;
    if (conditions === null) {
      throw new RangeError(`BankingSystem: bank ${bankId} has no current accounts`);
    }
    return conditions;
  }

  #savingsConditions(bankId: string): SavingsAccountConditions {
    const conditions = this.#bankConditions(bankId).savingsAccount;
    if (conditions === null) {
      throw new RangeError(`BankingSystem: bank ${bankId} has no savings accounts`);
    }
    return conditions;
  }
}

/** The booking of a tax delta on an account against the tax office (TS §7.7), `null` for 0. */
function taxDraft(tick: Tick, accountId: AccountId, delta: Cents): TransactionDraft | null {
  const type = taxTransactionType(delta);
  if (type === null) {
    return null;
  }
  return {
    tick,
    type,
    postings: [
      { account: accountId, amount: -delta },
      { account: TAX_OFFICE_ACCOUNT, amount: delta },
    ],
  };
}
