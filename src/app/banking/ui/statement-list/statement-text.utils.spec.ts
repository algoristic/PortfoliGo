import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { StatementCounterparty, StatementEntry } from '@app/banking/domain/models/statement.model';

import { statementEntryText } from './statement-text.utils';

const MS_PER_MINUTE = 60_000;
const BANK_NAMES = new Map([
  ['b1', 'Hansebank'],
  ['b2', 'Direktbank Süd'],
]);
const SAVINGS: StatementCounterparty = {
  kind: 'own',
  accountId: 'acc-2',
  accountKind: 'savings',
  bankId: 'b2',
  number: '0000000002',
};
const CURRENT: StatementCounterparty = {
  kind: 'own',
  accountId: 'acc-1',
  accountKind: 'current',
  bankId: 'b1',
  number: '0000000001',
};

/** Tick of a game time in UTC (TS §3.2). */
function tickAt(year: number, month: number, day: number, hour = 0): number {
  return (Date.UTC(year, month - 1, day, hour) - Date.UTC(2020, 0, 1)) / MS_PER_MINUTE;
}

function entry(type: TransactionType, changes: Partial<StatementEntry> = {}): StatementEntry {
  return {
    seq: 1,
    tick: tickAt(2030, 5, 2, 6),
    type,
    amount: -100,
    balanceAfter: 0,
    counterparties: [],
    params: {},
    refs: {},
    ...changes,
  };
}

describe('statementEntryText', () => {
  // TS §8.6: booking texts of the statement
  it.each<[string, StatementEntry, string, string | null]>([
    ['opening balance', entry('opening-balance'), 'Startkapital', null],
    ['salary', entry('salary', { params: { month: '2030-04' } }), 'Gehalt April 2030', null],
    [
      'living costs',
      entry('living-costs', { params: { month: '2030-04' } }),
      'Lebenshaltung April 2030',
      null,
    ],
    [
      'account fee',
      entry('account-fee', { params: { month: '2030-12' } }),
      'Kontoführung Dezember 2030',
      null,
    ],
    [
      'credit interest of a month',
      entry('credit-interest', { params: { from: '2030-04', to: '2030-04' } }),
      'Habenzinsen 01.04.–30.04.2030',
      null,
    ],
    [
      'credit interest of a quarter',
      entry('credit-interest', {
        tick: tickAt(2031, 1, 2, 6),
        params: { from: '2030-10', to: '2030-12' },
      }),
      'Habenzinsen 01.10.–31.12.2030',
      null,
    ],
    [
      'credit interest when the account closes',
      entry('credit-interest', {
        tick: tickAt(2030, 5, 15, 10),
        params: { from: '2030-05', to: '2030-05' },
      }),
      'Habenzinsen 01.05.–14.05.2030',
      null,
    ],
    [
      'overdraft interest',
      entry('overdraft-interest', { params: { from: '2030-04', to: '2030-04' } }),
      'Dispozinsen 01.04.–30.04.2030',
      null,
    ],
    [
      'debit interest of February in a leap year',
      entry('debit-interest', {
        tick: tickAt(2032, 3, 1, 6),
        params: { from: '2032-02', to: '2032-02' },
      }),
      'Sollzinsen 01.02.–29.02.2032',
      null,
    ],
    ['tax', entry('tax'), 'Abgeltungsteuer', null],
    ['tax refund', entry('tax-refund'), 'Steuererstattung', null],
    [
      'outgoing transfer',
      entry('transfer', { counterparties: [SAVINGS], params: { purpose: 'Urlaub Mai' } }),
      'Überweisung an Tagesgeld 0000000002 · Direktbank Süd',
      'Urlaub Mai',
    ],
    [
      'incoming transfer without purpose',
      entry('transfer', { amount: 100, counterparties: [CURRENT], params: { purpose: ' ' } }),
      'Überweisung von Girokonto 0000000001 · Hansebank',
      null,
    ],
    [
      'remainder of a closed account, closed side',
      entry('transfer', { counterparties: [CURRENT], refs: { closedAccountId: 'acc-2' } }),
      'Restguthaben an Girokonto 0000000001 · Hansebank',
      'Kontoauflösung',
    ],
    [
      'remainder of a closed account, receiving side',
      entry('transfer', {
        amount: 100,
        counterparties: [SAVINGS],
        refs: { closedAccountId: 'acc-2' },
      }),
      'Restguthaben von Tagesgeld 0000000002 · Direktbank Süd',
      'Kontoauflösung',
    ],
    [
      'outgoing standing order',
      entry('transfer', {
        counterparties: [SAVINGS],
        refs: { standingOrderId: 'so-1' },
        params: { purpose: 'Sparrate' },
      }),
      'Dauerauftrag an Tagesgeld 0000000002 · Direktbank Süd',
      'Sparrate',
    ],
    [
      'incoming standing order without purpose',
      entry('transfer', {
        amount: 100,
        counterparties: [CURRENT],
        refs: { standingOrderId: 'so-1' },
        params: { purpose: '' },
      }),
      'Dauerauftrag von Girokonto 0000000001 · Hansebank',
      null,
    ],
  ])('names %s', (_name, statementEntry, text, detail) => {
    expect(statementEntryText(statementEntry, BANK_NAMES)).toEqual({ text, detail });
  });
});
