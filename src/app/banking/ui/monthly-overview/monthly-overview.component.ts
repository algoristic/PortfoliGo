import { Component, computed, input } from '@angular/core';

import { savingsRate } from '@app/banking/domain/monthly-values-logic';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableScrollDirective } from '@app/shared/ui/table/table-scroll.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';
import { formatCents, formatOptional, formatPercent } from '@app/shared/util/format';

import { perLocale } from '@app/shared/util/locale';

import {
  MONTHLY_OVERVIEW_COLUMNS,
  MonthlyOverviewColumnId,
  MonthlyOverviewMonth,
  MonthlyOverviewRowView,
} from './monthly-overview.model';

const monthFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }),
);

/**
 * Where the money of each month went (US-EK-03, AP 3.5): income, living costs, fees, interest,
 * taxes, earnings and the savings rate, in the order given (the running month first). Expenses are
 * amounts; taxes are net and may be negative.
 */
@Component({
  selector: 'app-monthly-overview',
  imports: [
    TableScrollDirective,
    TableCellDirective,
    TableDirective,
    CardDirective,
    BadgeComponent,
  ],
  templateUrl: './monthly-overview.component.html',
  host: { class: 'block' },
})
export class MonthlyOverviewComponent {
  months = input.required<MonthlyOverviewMonth[]>();

  columns = MONTHLY_OVERVIEW_COLUMNS.map((id) => ({ id, label: columnLabel(id) }));

  rows = computed((): MonthlyOverviewRowView[] =>
    this.months().map(({ month, values, running }) => {
      const cells: Record<MonthlyOverviewColumnId, string> = {
        income: formatCents(values.income),
        'living-costs': formatCents(values.livingCosts),
        fees: formatCents(values.fees),
        'credit-interest': formatCents(values.creditInterest),
        'debit-interest': formatCents(values.debitInterest),
        taxes: formatCents(values.taxes),
        dividends: formatCents(values.dividends),
        'savings-rate': formatOptional(savingsRate(values), (rate) => formatPercent(rate, 1)),
      };
      return {
        id: `${month.year}-${String(month.month).padStart(2, '0')}`,
        label: monthFormat().format(Date.UTC(month.year, month.month - 1, 1)),
        running,
        cells: MONTHLY_OVERVIEW_COLUMNS.map((id) => ({ id, value: cells[id] })),
      };
    }),
  );

  label = $localize`:@@uiBanking-monthlyOverview-label:Monatsübersicht`;
}

function columnLabel(id: MonthlyOverviewColumnId): string {
  switch (id) {
    case 'income':
      return $localize`:@@uiBanking-monthlyOverview-income:Einkommen`;
    case 'living-costs':
      return $localize`:@@uiBanking-monthlyOverview-livingCosts:Lebenshaltung`;
    case 'fees':
      return $localize`:@@uiBanking-monthlyOverview-fees:Gebühren`;
    case 'credit-interest':
      return $localize`:@@uiBanking-monthlyOverview-creditInterest:Habenzinsen`;
    case 'debit-interest':
      return $localize`:@@uiBanking-monthlyOverview-debitInterest:Soll- und Dispozinsen`;
    case 'taxes':
      return $localize`:@@uiBanking-monthlyOverview-taxes:Steuern`;
    case 'dividends':
      return $localize`:@@uiBanking-monthlyOverview-dividends:Erträge`;
    case 'savings-rate':
      return $localize`:@@uiBanking-monthlyOverview-savingsRate:Sparquote`;
  }
}
