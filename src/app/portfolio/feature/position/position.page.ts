import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { map } from 'rxjs';

import { DepotId } from '@app/banking/domain/models/account.model';
import { InstrumentChartComponent } from '@app/market/feature/instrument-chart/instrument-chart.component';
import { MarketFacade } from '@app/market/feature/state/market.facade';
import { InstrumentQuoteComponent } from '@app/market/ui/instrument-quote/instrument-quote.component';
import { LotListComponent } from '@app/portfolio/ui/lot-list/lot-list.component';
import { PositionSummaryComponent } from '@app/portfolio/ui/position-summary/position-summary.component';
import { TradeListComponent } from '@app/portfolio/ui/trade-list/trade-list.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { SelectDirective } from '@app/shared/ui/select/select.directive';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { TradingFacade } from '@app/trading/feature/state/trading.facade';
import { TradeActionsComponent } from '@app/trading/ui/trade-actions/trade-actions.component';

import { PortfolioFacade } from '../state/portfolio.facade';

/** Value of the depot choice for all depots combined. */
const ALL_DEPOTS = 'all';

/**
 * Position detail (US-PF-06) of the instrument in the route, in the depot chosen on the depot page
 * or all depots combined: price head, key figures, the chart with the own trades marked, lots,
 * and the order executions and savings plan purchases from the journal; buying and selling through the order ticket. Without
 * shares an empty state links to the instrument page.
 */
@Component({
  selector: 'app-position-page',
  imports: [
    SelectDirective,
    CommonModule,
    RouterModule,
    ButtonDirective,
    EmptyStateComponent,
    IconDirective,
    InstrumentChartComponent,
    InstrumentQuoteComponent,
    LotListComponent,
    PanelComponent,
    PositionSummaryComponent,
    SkeletonComponent,
    TradeActionsComponent,
    TradeListComponent,
  ],
  templateUrl: './position.page.html',
  host: { class: 'block' },
})
export class PositionPage {
  portfolioFacade = inject(PortfolioFacade);
  marketFacade = inject(MarketFacade);
  tradingFacade = inject(TradingFacade);
  readonly #breakpointObserver = inject(BreakpointObserver);

  allDepots = ALL_DEPOTS;

  wide = toSignal(
    this.#breakpointObserver.observe('(min-width: 48rem)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  depotLabel = $localize`:@@featurePortfolio-positionPage-depot:Depot`;
  chartHeading = $localize`:@@featurePortfolio-positionPage-chart:Kursverlauf mit deinen Käufen und Verkäufen`;
  lotsHeading = $localize`:@@featurePortfolio-positionPage-lots:Lots`;
  tradesHeading = $localize`:@@featurePortfolio-positionPage-trades:Käufe und Verkäufe`;
  noPositionHeading = $localize`:@@featurePortfolio-positionPage-noPositionHeading:Keine Position`;
  noPositionText = $localize`:@@featurePortfolio-positionPage-noPositionText:Du hältst dieses Wertpapier in der Auswahl nicht (mehr). Realisierte Gewinne und Ausschüttungen verkaufter Positionen stehen im Kontoauszug des Verrechnungskontos.`;
  notFoundHeading = $localize`:@@featurePortfolio-positionPage-notFound:Wertpapier nicht gefunden`;
  notFoundText = $localize`:@@featurePortfolio-positionPage-notFoundText:Zu dieser Adresse gibt es in dieser Welt kein Wertpapier.`;

  onSelectDepot(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.portfolioFacade.selectDepot(value === ALL_DEPOTS ? null : (value as DepotId));
  }

  onBuy(instrumentId: string, depotId: DepotId | null): void {
    this.tradingFacade.clickBuy(instrumentId, depotId ?? undefined);
  }

  onSell(instrumentId: string, depotId: DepotId | null): void {
    this.tradingFacade.clickSell(instrumentId, depotId ?? undefined);
  }

  onCreateSavingsPlan(instrumentId: string, depotId: DepotId | null): void {
    this.tradingFacade.clickCreateSavingsPlan(instrumentId, depotId ?? undefined);
  }
}
