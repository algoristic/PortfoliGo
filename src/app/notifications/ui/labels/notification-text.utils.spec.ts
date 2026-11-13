import { MonthlyValues } from '@app/banking/domain/models/household.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';

import { notificationText } from './notification-text.utils';

const NAMES = new Map([
  ['acc-1', 'Girokonto 0000000001 · Hansebank'],
  ['acc-2', 'Tagesgeld 0000000002 · Direktbank Süd'],
]);

const INSTRUMENTS = new Map([['stk-0001', 'Nordwerk AG']]);

const ORDER = {
  orderId: 'ord-1',
  depotId: 'dep-3',
  instrumentId: 'stk-0001',
  side: 'buy',
} as const;

const PAYOUT = {
  kind: 'dividend',
  accountId: 'acc-1',
  depotId: 'dep-3',
  instrumentId: 'stk-0001',
} as const;

const APRIL: MonthlyValues = {
  income: 250_000,
  livingCosts: 180_000,
  fees: 1_200,
  creditInterest: 300,
  debitInterest: 0,
  taxes: 79,
  dividends: 0,
};

function notification(partial: Pick<GameNotification, 'code' | 'params'>): GameNotification {
  return { seq: 1, tick: 0, ...partial } as GameNotification;
}

describe('notificationText', () => {
  // TS §8.6, §12: texts from codes and parameters; accounts as „<Kontoart> <Nummer> · <Bank>“.
  it.each<[string, Pick<GameNotification, 'code' | 'params'>, string, string]>([
    [
      'an uncovered account with overdraft facility',
      {
        code: 'account-uncovered',
        params: { accountId: 'acc-1', balance: -12_000, limit: 500_000 },
      },
      'Konto nicht gedeckt',
      'Girokonto 0000000001 · Hansebank steht bei -120,00 € (Dispo-Rahmen 5.000,00 €).',
    ],
    [
      'an uncovered account without overdraft facility',
      { code: 'account-uncovered', params: { accountId: 'acc-2', balance: -300, limit: null } },
      'Konto nicht gedeckt',
      'Tagesgeld 0000000002 · Direktbank Süd steht bei -3,00 €.',
    ],
    [
      'an exceeded overdraft limit',
      {
        code: 'overdraft-limit-exceeded',
        params: { accountId: 'acc-1', balance: -200_000, limit: 100_000 },
      },
      'Dispo überschritten',
      'Girokonto 0000000001 · Hansebank steht bei -2.000,00 € und überschreitet den Dispo-Rahmen von 1.000,00 €.',
    ],
    [
      'an overdraft without limit',
      {
        code: 'overdraft-limit-exceeded',
        params: { accountId: 'acc-1', balance: -1_000, limit: 0 },
      },
      'Dispo überschritten',
      'Girokonto 0000000001 · Hansebank steht bei -10,00 € und hat keinen Dispo-Rahmen.',
    ],
    [
      'interest with tax withheld',
      { code: 'interest-credited', params: { accountId: 'acc-2', amount: 300, tax: 79 } },
      'Zinsen gutgeschrieben',
      '3,00 € Habenzinsen auf Tagesgeld 0000000002 · Direktbank Süd, davon 0,79 € Steuer einbehalten.',
    ],
    [
      'interest without tax',
      { code: 'interest-credited', params: { accountId: 'acc-2', amount: 50, tax: 0 } },
      'Zinsen gutgeschrieben',
      '0,50 € Habenzinsen auf Tagesgeld 0000000002 · Direktbank Süd.',
    ],
    [
      'interest with a refund',
      { code: 'interest-credited', params: { accountId: 'acc-2', amount: 300, tax: -120 } },
      'Zinsen gutgeschrieben',
      '3,00 € Habenzinsen auf Tagesgeld 0000000002 · Direktbank Süd, dazu 1,20 € Steuer erstattet.',
    ],
    [
      'a tax refund',
      { code: 'tax-refund', params: { accountId: 'acc-1', amount: 120 } },
      'Steuererstattung',
      '1,20 € Steuer auf Girokonto 0000000001 · Hansebank erstattet.',
    ],
    [
      'a closed month (US-EK-03)',
      { code: 'month-closed', params: { year: 2030, month: 4, values: APRIL } },
      'Monatsabschluss April 2030',
      // Earnings 2.500 + 3 = 2.503 €, spending 1.800 + 12 + 0,79 = 1.812,79 €, rate 27,6 %.
      'Einnahmen 2.503,00 €, Ausgaben 1.812,79 €, Sparquote 27,6 %.',
    ],
    [
      'a month without earnings',
      {
        code: 'month-closed',
        params: { year: 2030, month: 12, values: { ...APRIL, income: 0, creditInterest: 0 } },
      },
      'Monatsabschluss Dezember 2030',
      'Einnahmen 0,00 €, Ausgaben 1.812,79 €, Sparquote –.',
    ],
    [
      'a closed tax year',
      { code: 'year-closed', params: { year: 2030, taxableIncome: 12_300, taxWithheld: 3_244 } },
      'Steuerjahr 2030 abgeschlossen',
      'Steuerpflichtige Kapitalerträge 123,00 €, einbehaltene Steuer 32,44 €.',
    ],
    [
      'a code whose parameters follow with its AP',
      { code: 'savings-plan-executed', params: {} },
      'Sparplan ausgeführt',
      '',
    ],
  ])('words %s', (_case, partial, title, text) => {
    expect(notificationText(notification(partial), NAMES)).toEqual({ title, text });
  });

  // TS §7.5, §8.6: order texts with shares (as many decimals as the millionths need), the price
  // with the decimals of its grid (PS §10.4: 2 from 10 €, 3 from 1 €, else 4) and the total.
  it.each<[string, Pick<GameNotification, 'code' | 'params'>, string, string]>([
    [
      'an executed purchase of whole shares',
      {
        code: 'order-executed',
        params: { ...ORDER, quantity: 10_000_000, price: 123.45, total: 124_845, tax: 0 },
      },
      'Order ausgeführt',
      'Kauf von 10 Stück Nordwerk AG zu 123,45 €, belastet 1.248,45 €.',
    ],
    [
      'an executed sale of a fraction below 10 €',
      {
        code: 'order-executed',
        params: { ...ORDER, side: 'sell', quantity: 1_500_000, price: 8.002, total: 1_103 },
      },
      'Order ausgeführt',
      'Verkauf von 1,5 Stück Nordwerk AG zu 8,002 €, gutgeschrieben 11,03 €.',
    ],
    [
      'an executed purchase of millionths below 1 €',
      {
        code: 'order-executed',
        params: { ...ORDER, quantity: 1_234_567, price: 0.5123, total: 63, tax: 0 },
      },
      'Order ausgeführt',
      'Kauf von 1,234567 Stück Nordwerk AG zu 0,5123 €, belastet 0,63 €.',
    ],
    [
      'a purchase rejected for missing funds',
      { code: 'order-rejected', params: { ...ORDER, reason: 'insufficient-funds' } },
      'Order abgelehnt',
      'Kauforder für Nordwerk AG abgelehnt: Das Guthaben auf dem Verrechnungskonto reicht nicht.',
    ],
    [
      'a purchase rejected at the price floor',
      { code: 'order-rejected', params: { ...ORDER, reason: 'price-floor' } },
      'Order abgelehnt',
      'Kauforder für Nordwerk AG abgelehnt: Der Kurs liegt an der Preisuntergrenze.',
    ],
    [
      'a purchase by amount too small',
      { code: 'order-rejected', params: { ...ORDER, reason: 'amount-too-small' } },
      'Order abgelehnt',
      'Kauforder für Nordwerk AG abgelehnt: Der Betrag reicht nach Abzug der Kosten für keinen Kauf.',
    ],
    [
      'a sale rejected for missing shares',
      {
        code: 'order-rejected',
        params: { ...ORDER, side: 'sell', reason: 'insufficient-quantity' },
      },
      'Order abgelehnt',
      'Verkaufsorder für Nordwerk AG abgelehnt: Im Depot liegen nicht genug freie Stücke.',
    ],
    [
      'a dividend (AP 5.2)',
      {
        code: 'dividend-received',
        params: { ...PAYOUT, quantity: 10_000_000, amount: 850, tax: 0 },
      },
      'Dividende erhalten',
      'Dividende von 8,50 € für 10 Stück Nordwerk AG auf Girokonto 0000000001 · Hansebank gutgeschrieben.',
    ],
    [
      'a fund distribution for a fraction',
      {
        code: 'dividend-received',
        params: { ...PAYOUT, kind: 'fund-distribution', quantity: 2_500_000, amount: 61, tax: 0 },
      },
      'Ausschüttung erhalten',
      'Ausschüttung von 0,61 € für 2,5 Stück Nordwerk AG auf Girokonto 0000000001 · Hansebank gutgeschrieben.',
    ],
    [
      'a dividend with tax (from AP 5.3)',
      {
        code: 'dividend-received',
        params: { ...PAYOUT, quantity: 10_000_000, amount: 850, tax: 224 },
      },
      'Dividende erhalten',
      'Dividende von 8,50 € für 10 Stück Nordwerk AG auf Girokonto 0000000001 · Hansebank gutgeschrieben, davon 2,24 € Steuer einbehalten.',
    ],
    [
      'a dividend with a refund',
      {
        code: 'dividend-received',
        params: { ...PAYOUT, quantity: 10_000_000, amount: 850, tax: -100 },
      },
      'Dividende erhalten',
      'Dividende von 8,50 € für 10 Stück Nordwerk AG auf Girokonto 0000000001 · Hansebank gutgeschrieben, dazu 1,00 € Steuer erstattet.',
    ],
    [
      'an expired purchase',
      { code: 'order-expired', params: ORDER },
      'Order verfallen',
      'Die Kauforder für Nordwerk AG ist verfallen.',
    ],
    [
      'an expired sale',
      { code: 'order-expired', params: { ...ORDER, side: 'sell' } },
      'Order verfallen',
      'Die Verkaufsorder für Nordwerk AG ist verfallen.',
    ],
  ])('words %s', (_case, partial, title, text) => {
    expect(notificationText(notification(partial), NAMES, INSTRUMENTS)).toEqual({ title, text });
  });

  it('shows the ID of an instrument it has no name for', () => {
    expect(
      notificationText(notification({ code: 'order-expired', params: ORDER }), NAMES).text,
    ).toBe('Die Kauforder für stk-0001 ist verfallen.');
  });

  it('shows the ID of an account it has no name for', () => {
    expect(
      notificationText(
        notification({
          code: 'tax-refund',
          params: { accountId: 'acc-9', amount: 100 },
        }),
        NAMES,
      ).text,
    ).toBe('1,00 € Steuer auf acc-9 erstattet.');
  });
});
