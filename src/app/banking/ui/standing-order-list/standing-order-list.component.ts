import { Component, computed, input, output } from '@angular/core';

import { StandingOrderId } from '@app/banking/domain/models/standing-order.model';
import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { formatCents } from '@app/shared/util/format';

import {
  StandingOrderAccount,
  StandingOrderListItem,
  StandingOrderPauseChange,
  StandingOrderRow,
} from './standing-order-list.model';

import { accountTitle } from '../labels/banking-labels';

/**
 * The standing orders of the player (US-BK-10, AP 5.6a): source → target, amount, day, next
 * execution or „pausiert“, purpose, with the actions change, pause or resume and delete.
 */
@Component({
  selector: 'app-standing-order-list',
  imports: [
    CardDirective,
    BadgeComponent,
    ButtonDirective,
    IconDirective,
    FormatCentsPipe,
    FormatGameDatePipe,
  ],
  templateUrl: './standing-order-list.component.html',
  host: { class: 'block' },
})
export class StandingOrderListComponent {
  orders = input.required<StandingOrderListItem[]>();

  clickedChange = output<StandingOrderId>();
  clickedPause = output<StandingOrderPauseChange>();
  clickedDelete = output<StandingOrderId>();

  rows = computed((): StandingOrderRow[] =>
    this.orders().map((order) => ({
      id: order.id,
      from: accountName(order.from, order.fromAccountId),
      to: accountName(order.to, order.toAccountId),
      amount: order.amount,
      day: order.day,
      purpose: order.purpose,
      paused: order.paused,
      nextExecution: order.nextExecution,
      name: $localize`:@@uiBanking-standingOrderList-name:Dauerauftrag ${formatCents(order.amount)}:amount: am ${order.day}:day:.`,
    })),
  );

  changeLabel = $localize`:@@uiBanking-standingOrderList-changeLabel:ändern`;
  pauseLabel = $localize`:@@uiBanking-standingOrderList-pauseLabel:pausieren`;
  resumeLabel = $localize`:@@uiBanking-standingOrderList-resumeLabel:fortsetzen`;
  deleteLabel = $localize`:@@uiBanking-standingOrderList-deleteLabel:löschen`;

  onChange(id: StandingOrderId): void {
    this.clickedChange.emit(id);
  }

  onPause(id: StandingOrderId, paused: boolean): void {
    this.clickedPause.emit({ id, paused });
  }

  onDelete(id: StandingOrderId): void {
    this.clickedDelete.emit(id);
  }
}

function accountName(account: StandingOrderAccount | null, id: string): string {
  return account === null ? id : accountTitle(account, account.bank?.name);
}
