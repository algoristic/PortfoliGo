import { FirstStepId } from '@app/dashboard/domain/models/first-steps.model';
import { UpcomingKind } from '@app/dashboard/domain/models/upcoming.model';
import { HistoryRange } from '@app/portfolio/domain/models/performance.model';

/** Short labels of the chart periods (US-PF-04). */
export function historyRangeLabel(range: HistoryRange): string {
  switch (range) {
    case '1m':
      return $localize`:@@uiDashboard-dashboardLabels-range1m:1M`;
    case '6m':
      return $localize`:@@uiDashboard-dashboardLabels-range6m:6M`;
    case '1y':
      return $localize`:@@uiDashboard-dashboardLabels-range1y:1J`;
    case '5y':
      return $localize`:@@uiDashboard-dashboardLabels-range5y:5J`;
    case 'max':
      return $localize`:@@uiDashboard-dashboardLabels-rangeMax:Max`;
  }
}

/** Title of a step of „Erste Schritte“ (US-UI-10). */
export function firstStepLabel(step: FirstStepId): string {
  switch (step) {
    case 'compare-banks':
      return $localize`:@@uiDashboard-dashboardLabels-stepCompareBanks:Banken vergleichen`;
    case 'open-depot':
      return $localize`:@@uiDashboard-dashboardLabels-stepOpenDepot:Depot eröffnen`;
    case 'transfer':
      return $localize`:@@uiDashboard-dashboardLabels-stepTransfer:Geld aufs Verrechnungskonto überweisen`;
    case 'first-purchase':
      return $localize`:@@uiDashboard-dashboardLabels-stepFirstPurchase:Erstes Wertpapier kaufen`;
    case 'savings-plan':
      return $localize`:@@uiDashboard-dashboardLabels-stepSavingsPlan:Sparplan anlegen`;
  }
}

/** What to do for a step, shown below its title. */
export function firstStepHint(step: FirstStepId): string {
  switch (step) {
    case 'compare-banks':
      return $localize`:@@uiDashboard-dashboardLabels-hintCompareBanks:Kosten für Konto, Depot und Orders unterscheiden sich je Bank.`;
    case 'open-depot':
      return $localize`:@@uiDashboard-dashboardLabels-hintOpenDepot:Unter „Konten“ ein Depot eröffnen; es kommt mit einem Verrechnungskonto.`;
    case 'transfer':
      return $localize`:@@uiDashboard-dashboardLabels-hintTransfer:Vom Girokonto aufs Verrechnungskonto überweisen, damit Käufe gedeckt sind.`;
    case 'first-purchase':
      return $localize`:@@uiDashboard-dashboardLabels-hintFirstPurchase:Unter „Märkte“ ein Wertpapier wählen und kaufen.`;
    case 'savings-plan':
      return $localize`:@@uiDashboard-dashboardLabels-hintSavingsPlan:Jeden Monat automatisch einen festen Betrag anlegen, am besten in einen ETF.`;
  }
}

/** Relative link of a step from the dashboard. */
export const FIRST_STEP_LINKS: Readonly<Record<FirstStepId, string>> = {
  'compare-banks': '../banks',
  'open-depot': '../accounts',
  transfer: '../accounts',
  'first-purchase': '../markets',
  'savings-plan': '../orders',
};

/** Whether the amount of a date goes in, out or between own accounts. */
export type UpcomingDirection = 'in' | 'out' | 'move';

export const UPCOMING_DIRECTIONS: Readonly<Record<UpcomingKind, UpcomingDirection>> = {
  'dividend-payment': 'in',
  salary: 'in',
  'living-costs': 'out',
  'account-fee': 'out',
  'custody-fee': 'out',
  'standing-order': 'move',
  'ex-dividend': 'move',
  'savings-plan': 'move',
  'order-expiry': 'move',
};

/** Title of a date of „Demnächst“ (TS §8.1). */
export function upcomingKindLabel(kind: UpcomingKind): string {
  switch (kind) {
    case 'dividend-payment':
      return $localize`:@@uiDashboard-dashboardLabels-upcomingDividendPayment:Dividende/Ausschüttung`;
    case 'salary':
      return $localize`:@@uiDashboard-dashboardLabels-upcomingSalary:Gehalt`;
    case 'living-costs':
      return $localize`:@@uiDashboard-dashboardLabels-upcomingLivingCosts:Lebenshaltung (Basisbetrag)`;
    case 'account-fee':
      return $localize`:@@uiDashboard-dashboardLabels-upcomingAccountFee:Kontoführung`;
    case 'custody-fee':
      return $localize`:@@uiDashboard-dashboardLabels-upcomingCustodyFee:Depotgebühr`;
    case 'standing-order':
      return $localize`:@@uiDashboard-dashboardLabels-upcomingStandingOrder:Dauerauftrag`;
    case 'ex-dividend':
      return $localize`:@@uiDashboard-dashboardLabels-upcomingExDividend:Ex-Tag`;
    case 'savings-plan':
      return $localize`:@@uiDashboard-dashboardLabels-upcomingSavingsPlan:Sparplan`;
    case 'order-expiry':
      return $localize`:@@uiDashboard-dashboardLabels-upcomingOrderExpiry:Order läuft ab`;
  }
}
