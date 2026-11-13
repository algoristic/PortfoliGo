import { MonthlyValues } from '@app/banking/domain/models/household.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';

import { notificationText } from './notification-text.utils';

const NAMES = new Map([
  ['acc-1', 'Girokonto 0000000001 · Hansebank'],
  ['acc-2', 'Tagesgeld 0000000002 · Direktbank Süd'],
]);

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
      'a code whose parameters follow in M5',
      { code: 'order-executed', params: {} },
      'Order ausgeführt',
      '',
    ],
  ])('words %s', (_case, partial, title, text) => {
    expect(notificationText(notification(partial), NAMES)).toEqual({ title, text });
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
