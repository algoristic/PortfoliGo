import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { DividendOverviewComponent } from '@app/market/ui/dividend-overview/dividend-overview.component';
import { IndexCompositionComponent } from '@app/market/ui/index-composition/index-composition.component';
import { InstrumentFiguresComponent } from '@app/market/ui/instrument-figures/instrument-figures.component';
import { InstrumentProfileComponent } from '@app/market/ui/instrument-profile/instrument-profile.component';
import { InstrumentQuoteComponent } from '@app/market/ui/instrument-quote/instrument-quote.component';
import { WatchlistToggleComponent } from '@app/market/ui/watchlist-toggle/watchlist-toggle.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { TradingFacade } from '@app/trading/feature/state/trading.facade';
import { TradeActionsComponent } from '@app/trading/ui/trade-actions/trade-actions.component';

import { InstrumentChartComponent } from '../instrument-chart/instrument-chart.component';
import { MarketFacade } from '../state/market.facade';

/**
 * Instrument page (US-MK-03): price head with the live quote and the watchlist star (US-MK-04,
 * US-MK-05), chart with indicators, key figures, profile, composition (indices and ETFs) and
 * dividends (shares and distributing ETFs), buying and selling through the order ticket (AP 5.4).
 */
@Component({
  selector: 'app-instrument-page',
  imports: [
    CommonModule,
    RouterModule,
    ButtonDirective,
    DividendOverviewComponent,
    EmptyStateComponent,
    IndexCompositionComponent,
    InstrumentChartComponent,
    InstrumentFiguresComponent,
    InstrumentProfileComponent,
    InstrumentQuoteComponent,
    PanelComponent,
    SkeletonComponent,
    TradeActionsComponent,
    WatchlistToggleComponent,
  ],
  templateUrl: './instrument.page.html',
  host: { class: 'block' },
})
export class InstrumentPage {
  facade = inject(MarketFacade);
  tradingFacade = inject(TradingFacade);

  figuresHeading = $localize`:@@featureMarket-instrumentPage-figures:Kennzahlen`;
  profileHeading = $localize`:@@featureMarket-instrumentPage-profile:Profil`;
  compositionHeading = $localize`:@@featureMarket-instrumentPage-composition:Zusammensetzung`;
  dividendsHeading = $localize`:@@featureMarket-instrumentPage-dividends:Dividenden`;
  notFoundHeading = $localize`:@@featureMarket-instrumentPage-notFound:Wertpapier nicht gefunden`;
  notFoundText = $localize`:@@featureMarket-instrumentPage-notFoundText:Zu dieser Adresse gibt es in dieser Welt kein Wertpapier.`;

  onBuy(instrumentId: string): void {
    this.tradingFacade.clickBuy(instrumentId);
  }

  onSell(instrumentId: string): void {
    this.tradingFacade.clickSell(instrumentId);
  }

  onToggleWatchlist(id: string, watched: boolean): void {
    if (watched) {
      this.facade.addToWatchlist(id);
    } else {
      this.facade.removeFromWatchlist(id);
    }
  }
}
