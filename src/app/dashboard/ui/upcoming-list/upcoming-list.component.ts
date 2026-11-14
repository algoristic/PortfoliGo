import { Component, computed, input } from '@angular/core';

import { Tick } from '@app/clock/domain/models/time.model';
import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { UpcomingKind } from '@app/dashboard/domain/models/upcoming.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatSignedCentsPipe } from '@app/shared/ui/pipes/format-signed-cents/format-signed-cents.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import {
  UPCOMING_DIRECTIONS,
  UpcomingDirection,
  upcomingKindLabel,
} from '../labels/dashboard-labels';
import { UpcomingEntry, UpcomingView } from '../models/dashboard-view.model';

const DIRECTION_CLASSES: Readonly<Record<UpcomingDirection, string>> = {
  in: 'text-up',
  out: 'text-down',
  move: 'text-fg',
};

interface UpcomingRow {
  key: string;
  kind: UpcomingKind;
  tick: Tick;
  title: string;
  detail: string | null;
  /** Signed for credits and debits, the magnitude for moves between own accounts. */
  amount: Cents | null;
  signed: boolean;
  amountClass: string;
}

/**
 * „Demnächst“ (PS §10.3, TS §8.1, E-05): plannable dates of the next days with their amounts;
 * living costs as base amount, nothing that depends on future prices.
 */
@Component({
  selector: 'app-upcoming-list',
  imports: [
    PanelComponent,
    EmptyStateComponent,
    SkeletonComponent,
    FormatGameDatePipe,
    FormatCentsPipe,
    FormatSignedCentsPipe,
  ],
  templateUrl: './upcoming-list.component.html',
  host: { class: 'block' },
})
export class UpcomingListComponent {
  upcoming = input.required<UpcomingView>();

  rows = computed(
    (): UpcomingRow[] | null =>
      this.upcoming().entries?.map((entry) => {
        const direction = UPCOMING_DIRECTIONS[entry.kind];
        return {
          key: entry.key,
          kind: entry.kind,
          tick: entry.tick,
          title: upcomingKindLabel(entry.kind),
          detail: this.#detail(entry),
          amount: entry.amount === null ? null : direction === 'out' ? -entry.amount : entry.amount,
          signed: direction !== 'move',
          amountClass: DIRECTION_CLASSES[direction],
        };
      }) ?? null,
  );

  heading = computed(() => {
    const days = this.upcoming().days;
    return days > 0
      ? $localize`:@@uiDashboard-upcomingList-headingDays:Demnächst (${days}:days: Tage)`
      : $localize`:@@uiDashboard-upcomingList-heading:Demnächst`;
  });

  #detail(entry: UpcomingEntry): string | null {
    switch (entry.kind) {
      case 'standing-order':
        return $localize`:@@uiDashboard-upcomingList-standingOrder:an ${entry.toAccountName ?? ''}:account:`;
      case 'custody-fee':
        return $localize`:@@uiDashboard-upcomingList-custodyFee:Betrag hängt von den Depotwerten ab`;
      case 'ex-dividend':
      case 'dividend-payment':
      case 'savings-plan':
      case 'order-expiry':
        return entry.instrumentName;
      case 'account-fee':
        return entry.accountName;
      default:
        return null;
    }
  }
}
