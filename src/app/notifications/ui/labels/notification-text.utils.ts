import {
  monthlyEarnings,
  monthlySpending,
  savingsRate,
} from '@app/banking/domain/monthly-values-logic';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { formatCents, formatOptional, formatPercent } from '@app/shared/util/format';

import { notificationCodeLabel } from './notification-labels';

/** Title and text of a notification as the centre, the toasts and the absence report show it. */
export interface NotificationText {
  title: string;
  /** Empty for codes whose parameters follow with their AP (M5, AP 6.4). */
  text: string;
}

/** Names of the player's accounts by ID, e.g. `Girokonto 0000000001 · Hansebank`. */
export type AccountNames = ReadonlyMap<string, string>;

const monthFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

/**
 * Title and text of a notification from its code and parameters (TS §8.6, §12): the engine sends
 * codes and numbers only. An account the names don't know shows its ID.
 */
export function notificationText(
  notification: GameNotification,
  accountNames: AccountNames,
): NotificationText {
  const title = notificationCodeLabel(notification.code);
  const account = (accountId: string): string => accountNames.get(accountId) ?? accountId;
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
      const monthName = monthFormat.format(Date.UTC(year, month - 1, 1));
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
    default:
      return { title, text: '' };
  }
}
