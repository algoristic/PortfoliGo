import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { StatementCounterparty, StatementEntry } from '@app/banking/domain/models/statement.model';

import { statementEntryText } from './statement-text.utils';

const MS_PER_MINUTE = 60_000;
const NBSP = '\u00a0';
const INSTRUMENT_NAMES = new Map([
  ['stk-1', 'Astix AG'],
  ['etf-1', 'Welt ETF'],
]);
// TS §7.5: the purchase of 10 shares at 100,00 €; savings plans buy fractional shares (TS §7.8).
const PURCHASE = { quantity: 10_000_000, price: 100, marketValue: 100_000 };
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
      'purchase by an order',
      entry('buy', { refs: { orderId: 'ord-1', instrumentId: 'stk-1' }, params: PURCHASE }),
      'Kauf Astix AG',
      `10 Stück zu 100,00${NBSP}€`,
    ],
    [
      'savings plan purchase',
      entry('buy', {
        refs: { savingsPlanId: 'sp-1', instrumentId: 'etf-1' },
        params: { quantity: 1_030_927, price: 48.5 },
      }),
      'Sparplan-Kauf Welt ETF',
      `1,030927 Stück zu 48,50${NBSP}€`,
    ],
    [
      'sale of a low-priced share with its grid',
      entry('sell', {
        amount: 100,
        refs: { orderId: 'ord-2', instrumentId: 'stk-1' },
        params: { quantity: 500_000, price: 0.1234 },
      }),
      'Verkauf Astix AG',
      `0,5 Stück zu 0,1234${NBSP}€`,
    ],
    [
      'purchase of an unknown security without shares',
      entry('buy', { refs: { orderId: 'ord-3', instrumentId: 'stk-9' } }),
      'Kauf stk-9',
      null,
    ],
    ['purchase without a security', entry('buy'), 'Kauf', null],
    [
      'dividend',
      entry('dividend', { amount: 100, refs: { depotId: 'dep-2', instrumentId: 'stk-1' } }),
      'Dividende Astix AG',
      null,
    ],
    [
      'fund distribution',
      entry('fund-distribution', { amount: 100, refs: { instrumentId: 'etf-1' } }),
      'Ausschüttung Welt ETF',
      null,
    ],
    [
      'tax on a sale',
      entry('tax', { refs: { orderId: 'ord-2', instrumentId: 'stk-1' } }),
      'Abgeltungsteuer Astix AG',
      null,
    ],
    [
      'tax refund on a payout',
      entry('tax-refund', { amount: 100, refs: { instrumentId: 'etf-1' } }),
      'Steuererstattung Welt ETF',
      null,
    ],
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
    expect(statementEntryText(statementEntry, BANK_NAMES, INSTRUMENT_NAMES)).toEqual({
      text,
      detail,
    });
  });
});
