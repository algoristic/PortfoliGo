import { Component, computed, input } from '@angular/core';

import {
  COST_KINDS,
  CostKind,
  ESTIMATED_COST_KINDS,
  IncomeCostsYear,
} from '@app/banking/domain/models/income-costs.model';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { formatCents } from '@app/shared/util/format';

import { perLocale } from '@app/shared/util/locale';

import { IncomeCostsYearView } from './income-costs.model';

const monthFormat = perLocale(
  (locale) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long' }),
);

/**
 * What investments and accounts earn and cost (US-PF-07, AP 5.7): per year the dividends and the
 * credit interest of each month and their sums, then the costs by kind with the estimated spread
 * and TER costs marked; the running year first.
 */
@Component({
  selector: 'app-income-costs',
  imports: [BadgeComponent],
  templateUrl: './income-costs.component.html',
  host: { class: 'block' },
})
export class IncomeCostsComponent {
  years = input.required<IncomeCostsYear[]>();

  views = computed((): IncomeCostsYearView[] =>
    this.years().map((year) => ({
      year: year.year,
      running: year.running,
      months: year.months.map(({ month, dividends, creditInterest }) => ({
        id: String(month.month).padStart(2, '0'),
        label: monthFormat().format(Date.UTC(month.year, month.month - 1, 1)),
        dividends: formatCents(dividends),
        creditInterest: formatCents(creditInterest),
      })),
      dividends: formatCents(year.dividends),
      creditInterest: formatCents(year.creditInterest),
      costs: COST_KINDS.map((kind) => ({
        kind,
        label: costLabel(kind),
        value: formatCents(year.costs[kind]),
        estimated: ESTIMATED_COST_KINDS.includes(kind),
      })),
      totalCosts: formatCents(year.totalCosts),
      estimatedCosts: formatCents(year.estimatedCosts),
    })),
  );
}

function costLabel(kind: CostKind): string {
  switch (kind) {
    case 'orderFees':
      return $localize`:@@uiBanking-incomeCosts-orderFees:Orderentgelte (inkl. Börsenentgelt)`;
    case 'savingsPlanFees':
      return $localize`:@@uiBanking-incomeCosts-savingsPlanFees:Sparplankosten`;
    case 'accountFees':
      return $localize`:@@uiBanking-incomeCosts-accountFees:Kontoführung`;
    case 'custodyFees':
      return $localize`:@@uiBanking-incomeCosts-custodyFees:Depotgebühren`;
    case 'debitInterest':
      return $localize`:@@uiBanking-incomeCosts-debitInterest:Soll- und Dispozinsen`;
    case 'spreadCosts':
      return $localize`:@@uiBanking-incomeCosts-spreadCosts:Spread`;
    case 'terCosts':
      return $localize`:@@uiBanking-incomeCosts-terCosts:Laufende Fondskosten (TER)`;
  }
}
