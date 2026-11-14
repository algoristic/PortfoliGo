import { TextParams } from '@app/banking/domain/models/ledger.model';
import { StatementCounterparty, StatementEntry } from '@app/banking/domain/models/statement.model';
import {
  dateTimeToTick,
  daysInMonth,
  startOfDay,
  startOfMonth,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { formatGameDate } from '@app/clock/domain/game-time-format';
import { Tick, TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { priceDecimals } from '@app/shared/domain/price-step-logic';
import { formatPrice, formatQuantity } from '@app/shared/util/format';

import { perLocale } from '@app/shared/util/locale';

import { StatementEntryText } from './statement-list.model';

import { accountKindLabel, transactionTypeLabel } from '../labels/banking-labels';

const monthFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }),
);

/** Names of the securities by instrument ID (from the market slice). */
export type InstrumentNames = ReadonlyMap<string, string>;

const NO_INSTRUMENT_NAMES: InstrumentNames = new Map();

/**
 * Booking text of a statement entry from its type, parameters and other side (TS §8.6): the engine
 * stores codes and numbers, the purpose of a transfer is the player's own text. Bookings of a
 * security (`refs.instrumentId`) name it; a security the names don't know shows its ID.
 */
export function statementEntryText(
  entry: StatementEntry,
  bankNames: ReadonlyMap<string, string>,
  instrumentNames: InstrumentNames = NO_INSTRUMENT_NAMES,
): StatementEntryText {
  const instrumentId = entry.refs['instrumentId'];
  const instrument =
    instrumentId === undefined ? null : (instrumentNames.get(instrumentId) ?? instrumentId);
  switch (entry.type) {
    case 'opening-balance':
      return plain($localize`:@@uiBanking-statementText-openingBalance:Startkapital`);
    case 'salary':
      return (
        monthText(
          entry.params,
          (month) => $localize`:@@uiBanking-statementText-salary:Gehalt ${month}:month:`,
        ) ?? plain(transactionTypeLabel(entry.type))
      );
    case 'living-costs':
      return (
        monthText(
          entry.params,
          (month) =>
            $localize`:@@uiBanking-statementText-livingCosts:Lebenshaltung ${month}:month:`,
        ) ?? plain(transactionTypeLabel(entry.type))
      );
    case 'account-fee':
      return (
        monthText(
          entry.params,
          (month) => $localize`:@@uiBanking-statementText-accountFee:Kontoführung ${month}:month:`,
        ) ?? plain(transactionTypeLabel(entry.type))
      );
    case 'credit-interest':
      return periodText(
        entry,
        (period) =>
          $localize`:@@uiBanking-statementText-creditInterest:Habenzinsen ${period}:period:`,
      );
    case 'overdraft-interest':
      return periodText(
        entry,
        (period) =>
          $localize`:@@uiBanking-statementText-overdraftInterest:Dispozinsen ${period}:period:`,
      );
    case 'debit-interest':
      return periodText(
        entry,
        (period) =>
          $localize`:@@uiBanking-statementText-debitInterest:Sollzinsen ${period}:period:`,
      );
    case 'transfer':
      return transferText(entry, bankNames);
    case 'buy':
    case 'sell':
      return instrument === null
        ? plain(transactionTypeLabel(entry.type))
        : tradeText(entry, instrument);
    case 'dividend':
      return instrumentText(
        instrument,
        entry,
        (name) => $localize`:@@uiBanking-statementText-dividend:Dividende ${name}:instrument:`,
      );
    case 'fund-distribution':
      return instrumentText(
        instrument,
        entry,
        (name) =>
          $localize`:@@uiBanking-statementText-fundDistribution:Ausschüttung ${name}:instrument:`,
      );
    case 'tax':
      return instrumentText(
        instrument,
        entry,
        (name) => $localize`:@@uiBanking-statementText-tax:Abgeltungsteuer ${name}:instrument:`,
      );
    case 'tax-refund':
      return instrumentText(
        instrument,
        entry,
        (name) =>
          $localize`:@@uiBanking-statementText-taxRefund:Steuererstattung ${name}:instrument:`,
      );
    default:
      return plain(transactionTypeLabel(entry.type));
  }
}

function instrumentText(
  instrument: string | null,
  entry: StatementEntry,
  text: (name: string) => string,
): StatementEntryText {
  return plain(instrument === null ? transactionTypeLabel(entry.type) : text(instrument));
}

/**
 * A purchase or sale names the security, a savings plan purchase as such; the second line holds
 * shares and price when the parameters carry them.
 */
function tradeText(entry: StatementEntry, instrument: string): StatementEntryText {
  const text =
    entry.type === 'sell'
      ? $localize`:@@uiBanking-statementText-sell:Verkauf ${instrument}:instrument:`
      : entry.refs['savingsPlanId'] !== undefined
        ? $localize`:@@uiBanking-statementText-savingsPlanBuy:Sparplan-Kauf ${instrument}:instrument:`
        : $localize`:@@uiBanking-statementText-buy:Kauf ${instrument}:instrument:`;
  const { quantity, price } = entry.params;
  if (typeof quantity !== 'number' || typeof price !== 'number') {
    return plain(text);
  }
  const shares = formatQuantity(quantity);
  const at = formatPrice(price, priceDecimals(price));
  return {
    text,
    detail: $localize`:@@uiBanking-statementText-tradeDetail:${shares}:quantity: Stück zu ${at}:price:`,
  };
}

function plain(text: string): StatementEntryText {
  return { text, detail: null };
}

/** `2030-04` (the month of a booking) → `April 2030`. */
function monthText(params: TextParams, text: (month: string) => string): StatementEntryText | null {
  const month = parseMonth(params['month']);
  return month === null
    ? null
    : plain(text(monthFormat().format(Date.UTC(month.year, month.month - 1, 1))));
}

/**
 * Interest of the months `from` to `to`, e.g. `01.04.–30.04.2030`. When an account closes, the
 * interest runs to the day before the closing day, which lies in the month `to` (TS §7.4).
 */
function periodText(entry: StatementEntry, text: (period: string) => string): StatementEntryText {
  const from = parseMonth(entry.params['from']);
  const to = parseMonth(entry.params['to']);
  if (from === null || to === null) {
    return plain(transactionTypeLabel(entry.type));
  }
  let end: Tick = dateTimeToTick({ ...to, day: daysInMonth(to.year, to.month) });
  let start: Tick = dateTimeToTick({ ...from, day: 1 });
  if (end >= startOfDay(entry.tick)) {
    end = startOfDay(entry.tick) - TICKS_PER_DAY;
    start = Math.min(start, startOfMonth(end));
  }
  const endDate = formatGameDate(end);
  const startDate = formatGameDate(start);
  const sameYear = tickToDateTime(start).year === tickToDateTime(end).year;
  // `01.04.2030` → `01.04.` within one year
  return plain(text(`${sameYear ? startDate.slice(0, 6) : startDate}–${endDate}`));
}

function transferText(
  entry: StatementEntry,
  bankNames: ReadonlyMap<string, string>,
): StatementEntryText {
  const other = entry.counterparties.find(
    (counterparty): counterparty is Extract<StatementCounterparty, { kind: 'own' }> =>
      counterparty.kind === 'own',
  );
  if (other === undefined) {
    return plain(transactionTypeLabel(entry.type));
  }
  const account = `${accountKindLabel(other.accountKind)} ${other.number} · ${bankNames.get(other.bankId) ?? other.bankId}`;
  const outgoing = entry.amount < 0;
  if (entry.refs['closedAccountId'] !== undefined) {
    return {
      text: outgoing
        ? $localize`:@@uiBanking-statementText-closingRemainderTo:Restguthaben an ${account}:account:`
        : $localize`:@@uiBanking-statementText-closingRemainderFrom:Restguthaben von ${account}:account:`,
      detail: $localize`:@@uiBanking-statementText-closingRemainderDetail:Kontoauflösung`,
    };
  }
  const purpose = entry.params['purpose'];
  const detail = typeof purpose === 'string' && purpose.trim() !== '' ? purpose : null;
  if (entry.refs['standingOrderId'] !== undefined) {
    return {
      text: outgoing
        ? $localize`:@@uiBanking-statementText-standingOrderTo:Dauerauftrag an ${account}:account:`
        : $localize`:@@uiBanking-statementText-standingOrderFrom:Dauerauftrag von ${account}:account:`,
      detail,
    };
  }
  return {
    text: outgoing
      ? $localize`:@@uiBanking-statementText-transferTo:Überweisung an ${account}:account:`
      : $localize`:@@uiBanking-statementText-transferFrom:Überweisung von ${account}:account:`,
    detail,
  };
}

function parseMonth(value: string | number | undefined): { year: number; month: number } | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  return match === null ? null : { year: Number(match[1]), month: Number(match[2]) };
}
