import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { DividendCalendarRow } from '../models/dashboard-view.model';

/**
 * Dividend calendar for depot and watchlist (US-MK-06, AP 5.7): announced ex-dates with payment
 * date and amount per share, the expected payout for held instruments, and earned payouts still
 * to come. Dates the market has not announced yet are not shown.
 */
@Component({
  selector: 'app-dividend-calendar',
  imports: [
    RouterLink,
    PanelComponent,
    EmptyStateComponent,
    SkeletonComponent,
    FormatGameDatePipe,
    FormatCentsPipe,
  ],
  templateUrl: './dividend-calendar.component.html',
  host: { class: 'block' },
})
export class DividendCalendarComponent {
  /** `null` while the first query runs. */
  entries = input.required<DividendCalendarRow[] | null>();

  heading = $localize`:@@uiDashboard-dividendCalendar-heading:Dividendenkalender`;
}
