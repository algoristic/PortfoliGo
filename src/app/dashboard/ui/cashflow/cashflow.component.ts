import { Component, computed, input } from '@angular/core';

import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { perLocale } from '@app/shared/util/locale';

import { CashflowView } from '../models/dashboard-view.model';

const monthFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
);

/**
 * Cash flow of the running month (PS §10.3, US-EK-03): earnings (income, interest, payouts),
 * spending (living costs, fees, debit interest, taxes) and the savings rate so far.
 */
@Component({
  selector: 'app-cashflow',
  imports: [PanelComponent, SkeletonComponent, FormatCentsPipe, FormatPercentPipe],
  templateUrl: './cashflow.component.html',
  host: { class: 'block' },
})
export class CashflowComponent {
  /** `null` while loading. */
  cashflow = input.required<CashflowView | null>();

  heading = computed(() => {
    const cashflow = this.cashflow();
    const month =
      cashflow === null
        ? ''
        : monthFormat().format(Date.UTC(cashflow.month.year, cashflow.month.month - 1, 1));
    return $localize`:@@uiDashboard-cashflow-heading:Cashflow ${month}:month:`;
  });
}
