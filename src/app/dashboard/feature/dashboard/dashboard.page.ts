import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { BankingFacade } from '@app/banking/feature/state/banking.facade';
import { CashflowComponent } from '@app/dashboard/ui/cashflow/cashflow.component';
import { DividendCalendarComponent } from '@app/dashboard/ui/dividend-calendar/dividend-calendar.component';
import { FirstStepsComponent } from '@app/dashboard/ui/first-steps/first-steps.component';
import { NetWorthChartComponent } from '@app/dashboard/ui/net-worth-chart/net-worth-chart.component';
import { NetWorthSummaryComponent } from '@app/dashboard/ui/net-worth-summary/net-worth-summary.component';
import { PerformanceFiguresComponent } from '@app/dashboard/ui/performance-figures/performance-figures.component';
import { RecentNotificationsComponent } from '@app/dashboard/ui/recent-notifications/recent-notifications.component';
import { TopPositionsComponent } from '@app/dashboard/ui/top-positions/top-positions.component';
import { UpcomingListComponent } from '@app/dashboard/ui/upcoming-list/upcoming-list.component';
import { WatchlistSummaryComponent } from '@app/dashboard/ui/watchlist-summary/watchlist-summary.component';
import { NotificationsFacade } from '@app/notifications/feature/state/notifications.facade';
import { HistoryRange } from '@app/portfolio/domain/models/performance.model';
import { PortfolioFacade } from '@app/portfolio/feature/state/portfolio.facade';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

import { DashboardFacade } from '../state/dashboard.facade';

/**
 * The dashboard „Übersicht“ (PS §10.3, AP 5.7): „Erste Schritte“, net worth with its history,
 * performance, „Demnächst“, the month's cash flow, top positions, the dividend calendar, watchlist
 * and the newest notifications; one column on phones, two from `md`, three from `xl`. Hidden
 * „Erste Schritte“ come back with a button below the tiles.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    CommonModule,
    FirstStepsComponent,
    NetWorthSummaryComponent,
    NetWorthChartComponent,
    PerformanceFiguresComponent,
    UpcomingListComponent,
    CashflowComponent,
    TopPositionsComponent,
    DividendCalendarComponent,
    WatchlistSummaryComponent,
    RecentNotificationsComponent,
    ButtonDirective,
    IconDirective,
  ],
  templateUrl: './dashboard.page.html',
  host: { class: 'block' },
})
export class DashboardPage {
  dashboardFacade = inject(DashboardFacade);
  portfolioFacade = inject(PortfolioFacade);
  bankingFacade = inject(BankingFacade);
  notificationsFacade = inject(NotificationsFacade);

  onSelectRange(range: HistoryRange): void {
    this.portfolioFacade.selectHistoryRange(range);
  }

  onHideFirstSteps(): void {
    this.dashboardFacade.hideFirstSteps();
  }

  onShowFirstSteps(): void {
    this.dashboardFacade.showFirstSteps();
  }
}
