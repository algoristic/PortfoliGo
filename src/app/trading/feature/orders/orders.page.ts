import { CommonModule } from '@angular/common';
import { Component, effect, ElementRef, inject, Injector, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { focusIfLost } from '@app/shared/ui/focus/focus-if-lost';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { TabPanelDirective } from '@app/shared/ui/tabs/tab-panel.directive';
import { TabsComponent } from '@app/shared/ui/tabs/tabs.component';
import { TabItem } from '@app/shared/ui/tabs/tabs.model';
import { SavingsPlanId } from '@app/trading/domain/models/savings-plan.model';
import { SavingsPlanPauseChange } from '@app/trading/ui/models/savings-plan.model';
import { OpenOrdersComponent } from '@app/trading/ui/open-orders/open-orders.component';
import { OrderHistoryComponent } from '@app/trading/ui/order-history/order-history.component';
import { SavingsPlanListComponent } from '@app/trading/ui/savings-plan-list/savings-plan-list.component';

import { TradingFacade } from '../state/trading.facade';

/**
 * Order book (US-HD-04): the open and triggered orders with the reserved money per clearing account,
 * „Ändern“ and „Stornieren“, the history of closed orders with their executions, and the savings
 * plans (US-HD-05, AP 5.6b) with „Sparplan anlegen“, change, pause and delete.
 */
@Component({
  selector: 'app-orders-page',
  imports: [
    CommonModule,
    OpenOrdersComponent,
    OrderHistoryComponent,
    ButtonDirective,
    EmptyStateComponent,
    IconDirective,
    SavingsPlanListComponent,
    SkeletonComponent,
    TabPanelDirective,
    TabsComponent,
  ],
  templateUrl: './orders.page.html',
  host: { class: 'block' },
})
export class OrdersPage {
  tradingFacade = inject(TradingFacade);
  readonly #injector = inject(Injector);

  heading = viewChild<ElementRef<HTMLElement>>('heading');

  #openOrderIds = toSignal(
    this.tradingFacade.openOrders$.pipe(map((orders) => orders.map((order) => order.id).join(','))),
    { initialValue: '' },
  );

  tabs: TabItem[] = [
    { id: 'open', label: $localize`:@@featureTrading-ordersPage-openTab:Offen` },
    { id: 'history', label: $localize`:@@featureTrading-ordersPage-historyTab:Historie` },
    {
      id: 'savings-plans',
      label: $localize`:@@featureTrading-ordersPage-savingsPlansTab:Sparpläne`,
    },
  ];
  tabsLabel = $localize`:@@featureTrading-ordersPage-tabsLabel:Orders`;
  noSavingsPlansHeading = $localize`:@@featureTrading-ordersPage-noSavingsPlansHeading:Noch keine Sparpläne`;
  noSavingsPlansText = $localize`:@@featureTrading-ordersPage-noSavingsPlansText:Ein Sparplan kauft jeden Monat für einen festen Betrag Bruchstücke eines ETFs oder einer großen Aktie.`;

  constructor() {
    // „Ändern“ or „Stornieren“ of an order that closes or executes takes the focus along; it goes
    // to the heading instead of falling back to `<body>` (TS §11.10).
    let previous = '';
    effect(() => {
      const ids = this.#openOrderIds();
      if (ids !== previous) {
        focusIfLost(this.#injector, () => this.heading()?.nativeElement);
      }
      previous = ids;
    });
  }

  onChange(orderId: string): void {
    this.tradingFacade.clickChangeOrder(orderId);
  }

  onCancel(orderId: string): void {
    this.tradingFacade.clickCancelOrder(orderId);
  }

  onCreateSavingsPlan(): void {
    this.tradingFacade.clickCreateSavingsPlan();
  }

  onChangeSavingsPlan(savingsPlanId: SavingsPlanId): void {
    this.tradingFacade.clickChangeSavingsPlan(savingsPlanId);
  }

  onPauseSavingsPlan({ id, paused }: SavingsPlanPauseChange): void {
    this.tradingFacade.setSavingsPlanPaused(id, paused);
  }

  onDeleteSavingsPlan(savingsPlanId: SavingsPlanId): void {
    this.tradingFacade.clickDeleteSavingsPlan(savingsPlanId);
  }
}
