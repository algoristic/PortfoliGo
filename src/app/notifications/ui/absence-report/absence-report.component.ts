import { Component, computed, input } from '@angular/core';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import { NOTIFICATION_CODE_INFO } from '@app/notifications/domain/models/notification.model';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';

import {
  AbsenceReportFlowGroupView,
  AbsenceReportFlowId,
  AbsenceReportFlowView,
  AbsenceReportIndexView,
  AbsenceReportOrderView,
  AbsenceReportWarningView,
} from './absence-report.model';

import { notificationSeverityLabel } from '../labels/notification-labels';
import { AccountNames, InstrumentNames, notificationText } from '../labels/notification-text.utils';
import { SEVERITY_ICONS } from '../notification-list/notification-list.model';

const NO_NAMES: AccountNames = new Map();

/**
 * What happened while the player was away (US-BN-03): period, change of the net worth, income and
 * expenses by category including interest, the warnings, executed and expired orders and the
 * development of the indices. Savings plans follow with AP 5.6.
 */
@Component({
  selector: 'app-absence-report',
  imports: [
    IconDirective,
    FormatCentsPipe,
    FormatGameTimePipe,
    FormatNumberPipe,
    PriceChangeComponent,
  ],
  templateUrl: './absence-report.component.html',
  host: { class: 'block' },
})
export class AbsenceReportComponent {
  report = input.required<AbsenceReport>();
  /** `null` until the accounts are known; texts then show account IDs. */
  accountNames = input<AccountNames | null>(null);
  /** `null` until the master data is loaded; texts then show instrument IDs. */
  instrumentNames = input<InstrumentNames | null>(null);

  severityIcons = SEVERITY_ICONS;

  netWorthChange = computed(() => this.report().netWorthAfter - this.report().netWorthBefore);
  flowGroups = computed((): AbsenceReportFlowGroupView[] => {
    const flows = this.report().flows;
    return [
      {
        id: 'income',
        label: this.incomeLabel,
        flows: [
          flow('income', flows.income),
          flow('credit-interest', flows.creditInterest),
          flow('dividends', flows.dividends),
        ],
      },
      {
        id: 'expenses',
        label: this.expensesLabel,
        flows: [
          flow('living-costs', flows.livingCosts),
          flow('fees', flows.fees),
          flow('debit-interest', flows.debitInterest),
          flow('taxes', flows.taxes),
        ],
      },
    ];
  });
  warnings = computed((): AbsenceReportWarningView[] =>
    // Newest first, as in the notification centre.
    [...this.report().warnings].reverse().map((notification) => {
      const severity = NOTIFICATION_CODE_INFO[notification.code].severity;
      return {
        seq: notification.seq,
        tick: notification.tick,
        severity,
        severityLabel: notificationSeverityLabel(severity),
        ...notificationText(
          notification,
          this.accountNames() ?? NO_NAMES,
          this.instrumentNames() ?? NO_NAMES,
        ),
      };
    }),
  );
  orders = computed((): AbsenceReportOrderView[] =>
    [...this.report().orders].reverse().map((notification) => ({
      seq: notification.seq,
      tick: notification.tick,
      ...notificationText(
        notification,
        this.accountNames() ?? NO_NAMES,
        this.instrumentNames() ?? NO_NAMES,
      ),
    })),
  );
  hiddenOrders = computed(() => this.report().orderCount - this.report().orders.length);
  hiddenWarnings = computed(() => this.report().warningCount - this.report().warnings.length);
  indices = computed((): AbsenceReportIndexView[] =>
    this.report().indices.map(({ id, name, start, end }) => ({
      id,
      name,
      start,
      end,
      change: start > 0 ? (end - start) / start : null,
    })),
  );

  incomeLabel = $localize`:@@uiNotifications-absenceReport-income:Einnahmen`;
  expensesLabel = $localize`:@@uiNotifications-absenceReport-expenses:Ausgaben`;
  indicesLabel = $localize`:@@uiNotifications-absenceReport-indices:Indizes`;
}

function flow(id: AbsenceReportFlowId, amount: number): AbsenceReportFlowView {
  return { id, label: flowLabel(id), amount };
}

function flowLabel(id: AbsenceReportFlowId): string {
  switch (id) {
    case 'income':
      return $localize`:@@uiNotifications-absenceReport-flowIncome:Einkommen`;
    case 'credit-interest':
      return $localize`:@@uiNotifications-absenceReport-flowCreditInterest:Habenzinsen`;
    case 'dividends':
      return $localize`:@@uiNotifications-absenceReport-flowDividends:Dividenden`;
    case 'living-costs':
      return $localize`:@@uiNotifications-absenceReport-flowLivingCosts:Lebenshaltung`;
    case 'fees':
      return $localize`:@@uiNotifications-absenceReport-flowFees:Gebühren`;
    case 'debit-interest':
      return $localize`:@@uiNotifications-absenceReport-flowDebitInterest:Soll- und Dispozinsen`;
    case 'taxes':
      return $localize`:@@uiNotifications-absenceReport-flowTaxes:Steuern`;
  }
}
