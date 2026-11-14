import {
  monthlyEarnings,
  monthlySpending,
  savingsRate,
} from '@app/banking/domain/monthly-values-logic';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { priceDecimals } from '@app/shared/domain/price-step-logic';
import {
  formatCents,
  formatOptional,
  formatPercent,
  formatPrice,
  formatQuantity,
} from '@app/shared/util/format';

import { perLocale } from '@app/shared/util/locale';

import {
  notificationCodeLabel,
  orderRejectionLabel,
  savingsPlanFailureLabel,
} from './notification-labels';

/** Title and text of a notification as the centre, the toasts and the absence report show it. */
export interface NotificationText {
  title: string;
  /** Empty for codes whose parameters follow with their AP (M5, AP 6.4). */
  text: string;
}

/** Names of the player's accounts by ID, e.g. `Girokonto 0000000001 · Hansebank`. */
export type AccountNames = ReadonlyMap<string, string>;

/** Names of the instruments by ID, from the master data (AP 4.1). */
export type InstrumentNames = ReadonlyMap<string, string>;

const NO_INSTRUMENT_NAMES: InstrumentNames = new Map();

const monthFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }),
);

/**
 * Title and text of a notification from its code and parameters (TS §8.6, §12): the engine sends
 * codes and numbers only. An account or instrument the names don't know shows its ID.
 */
export function notificationText(
  notification: GameNotification,
  accountNames: AccountNames,
  instrumentNames: InstrumentNames = NO_INSTRUMENT_NAMES,
): NotificationText {
  const title = notificationCodeLabel(notification.code);
  const account = (accountId: string): string => accountNames.get(accountId) ?? accountId;
  const instrument = (instrumentId: string): string =>
    instrumentNames.get(instrumentId) ?? instrumentId;
  switch (notification.code) {
    case 'account-uncovered': {
      const { accountId, balance, limit } = notification.params;
      const name = account(accountId);
      const amount = formatCents(balance);
      return {
        title,
        text:
          limit === null || limit === 0
            ? $localize`:@@uiNotifications-notificationText-accountUncovered:${name}:account: steht bei ${amount}:balance:.`
            : $localize`:@@uiNotifications-notificationText-accountUncoveredWithLimit:${name}:account: steht bei ${amount}:balance: (Dispo-Rahmen ${formatCents(limit)}:limit:).`,
      };
    }
    case 'overdraft-limit-exceeded': {
      const { accountId, balance, limit } = notification.params;
      const name = account(accountId);
      const amount = formatCents(balance);
      return {
        title,
        text:
          limit === null || limit === 0
            ? $localize`:@@uiNotifications-notificationText-overdraftWithoutLimit:${name}:account: steht bei ${amount}:balance: und hat keinen Dispo-Rahmen.`
            : $localize`:@@uiNotifications-notificationText-overdraftLimitExceeded:${name}:account: steht bei ${amount}:balance: und überschreitet den Dispo-Rahmen von ${formatCents(limit)}:limit:.`,
      };
    }
    case 'standing-order-failed': {
      const { fromAccountId, toAccountId, amount, available } = notification.params;
      return {
        title,
        text: $localize`:@@uiNotifications-notificationText-standingOrderFailed:${formatCents(amount)}:amount: von ${account(fromAccountId)}:from: an ${account(toAccountId)}:to: wurden nicht überwiesen: verfügbar waren nur ${formatCents(available)}:available:.`,
      };
    }
    case 'interest-credited': {
      const { accountId, amount, tax } = notification.params;
      const name = account(accountId);
      const interest = formatCents(amount);
      if (tax > 0) {
        return {
          title,
          text: $localize`:@@uiNotifications-notificationText-interestWithTax:${interest}:amount: Habenzinsen auf ${name}:account:, davon ${formatCents(tax)}:tax: Steuer einbehalten.`,
        };
      }
      if (tax < 0) {
        return {
          title,
          text: $localize`:@@uiNotifications-notificationText-interestWithRefund:${interest}:amount: Habenzinsen auf ${name}:account:, dazu ${formatCents(-tax)}:tax: Steuer erstattet.`,
        };
      }
      return {
        title,
        text: $localize`:@@uiNotifications-notificationText-interest:${interest}:amount: Habenzinsen auf ${name}:account:.`,
      };
    }
    case 'tax-refund': {
      const { accountId, amount } = notification.params;
      return {
        title,
        text: $localize`:@@uiNotifications-notificationText-taxRefund:${formatCents(amount)}:amount: Steuer auf ${account(accountId)}:account: erstattet.`,
      };
    }
    case 'month-closed': {
      const { year, month, values } = notification.params;
      const monthName = monthFormat().format(Date.UTC(year, month - 1, 1));
      const rate = formatOptional(savingsRate(values), (ratio) => formatPercent(ratio, 1));
      return {
        title: $localize`:@@uiNotifications-notificationText-monthClosedTitle:Monatsabschluss ${monthName}:month:`,
        text: $localize`:@@uiNotifications-notificationText-monthClosed:Einnahmen ${formatCents(monthlyEarnings(values))}:earnings:, Ausgaben ${formatCents(monthlySpending(values))}:spending:, Sparquote ${rate}:rate:.`,
      };
    }
    case 'year-closed': {
      const { year, taxableIncome, taxWithheld } = notification.params;
      return {
        title: $localize`:@@uiNotifications-notificationText-yearClosedTitle:Steuerjahr ${year}:year: abgeschlossen`,
        text: $localize`:@@uiNotifications-notificationText-yearClosed:Steuerpflichtige Kapitalerträge ${formatCents(taxableIncome)}:income:, einbehaltene Steuer ${formatCents(taxWithheld)}:tax:.`,
      };
    }
    case 'dividend-received': {
      const { kind, accountId, instrumentId, quantity, amount, tax } = notification.params;
      const name = instrument(instrumentId);
      const target = account(accountId);
      const shares = formatQuantity(quantity);
      const gross = formatCents(amount);
      const heading =
        kind === 'dividend'
          ? title
          : $localize`:@@uiNotifications-notificationText-fundDistributionTitle:Ausschüttung erhalten`;
      const credited =
        kind === 'dividend'
          ? $localize`:@@uiNotifications-notificationText-dividend:Dividende von ${gross}:amount: für ${shares}:quantity: Stück ${name}:instrument: auf ${target}:account: gutgeschrieben`
          : $localize`:@@uiNotifications-notificationText-fundDistribution:Ausschüttung von ${gross}:amount: für ${shares}:quantity: Stück ${name}:instrument: auf ${target}:account: gutgeschrieben`;
      if (tax > 0) {
        return {
          title: heading,
          text: $localize`:@@uiNotifications-notificationText-distributionWithTax:${credited}:credited:, davon ${formatCents(tax)}:tax: Steuer einbehalten.`,
        };
      }
      if (tax < 0) {
        return {
          title: heading,
          text: $localize`:@@uiNotifications-notificationText-distributionWithRefund:${credited}:credited:, dazu ${formatCents(-tax)}:tax: Steuer erstattet.`,
        };
      }
      return { title: heading, text: `${credited}.` };
    }
    case 'order-executed': {
      const { instrumentId, side, quantity, price, total, tax } = notification.params;
      const name = instrument(instrumentId);
      const shares = formatQuantity(quantity);
      const at = formatPrice(price, priceDecimals(price));
      const amount = formatCents(total);
      if (side === 'buy') {
        return {
          title,
          text: $localize`:@@uiNotifications-notificationText-orderExecutedBuy:Kauf von ${shares}:quantity: Stück ${name}:instrument: zu ${at}:price:, belastet ${amount}:total:.`,
        };
      }
      if (tax > 0) {
        return {
          title,
          text: $localize`:@@uiNotifications-notificationText-orderExecutedSellWithTax:Verkauf von ${shares}:quantity: Stück ${name}:instrument: zu ${at}:price:, gutgeschrieben ${amount}:total:, davon ${formatCents(tax)}:tax: Steuer einbehalten.`,
        };
      }
      if (tax < 0) {
        return {
          title,
          text: $localize`:@@uiNotifications-notificationText-orderExecutedSellWithRefund:Verkauf von ${shares}:quantity: Stück ${name}:instrument: zu ${at}:price:, gutgeschrieben ${amount}:total:, dazu ${formatCents(-tax)}:tax: Steuer erstattet.`,
        };
      }
      return {
        title,
        text: $localize`:@@uiNotifications-notificationText-orderExecutedSell:Verkauf von ${shares}:quantity: Stück ${name}:instrument: zu ${at}:price:, gutgeschrieben ${amount}:total:.`,
      };
    }
    case 'order-rejected': {
      const { instrumentId, side, reason } = notification.params;
      const name = instrument(instrumentId);
      const why = orderRejectionLabel(reason);
      return {
        title,
        text:
          side === 'buy'
            ? $localize`:@@uiNotifications-notificationText-orderRejectedBuy:Kauforder für ${name}:instrument: abgelehnt: ${why}:reason:`
            : $localize`:@@uiNotifications-notificationText-orderRejectedSell:Verkaufsorder für ${name}:instrument: abgelehnt: ${why}:reason:`,
      };
    }
    case 'order-expired': {
      const { instrumentId, side } = notification.params;
      const name = instrument(instrumentId);
      return {
        title,
        text:
          side === 'buy'
            ? $localize`:@@uiNotifications-notificationText-orderExpiredBuy:Die Kauforder für ${name}:instrument: ist verfallen.`
            : $localize`:@@uiNotifications-notificationText-orderExpiredSell:Die Verkaufsorder für ${name}:instrument: ist verfallen.`,
      };
    }
    case 'savings-plan-executed': {
      const { instrumentId, quantity, price, total } = notification.params;
      const name = instrument(instrumentId);
      const shares = formatQuantity(quantity);
      const at = formatPrice(price, priceDecimals(price));
      return {
        title,
        text: $localize`:@@uiNotifications-notificationText-savingsPlanExecuted:Sparplan: ${shares}:quantity: Stück ${name}:instrument: zu ${at}:price: gekauft, belastet ${formatCents(total)}:total:.`,
      };
    }
    case 'savings-plan-failed': {
      const { instrumentId, amount, reason, available } = notification.params;
      const name = instrument(instrumentId);
      const why = savingsPlanFailureLabel(reason, available);
      return {
        title,
        text: $localize`:@@uiNotifications-notificationText-savingsPlanFailed:Sparplan über ${formatCents(amount)}:amount: für ${name}:instrument: nicht ausgeführt: ${why}:reason:`,
      };
    }
    default:
      return { title, text: '' };
  }
}
