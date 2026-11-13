import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { MarketNavComponent } from '@app/market/ui/market-nav/market-nav.component';
import { NavItem } from '@app/shared/ui/nav-link/nav-item.model';

/** Frame of the markets area (TS §11.4): tabs for overview, screener and watchlist. */
@Component({
  selector: 'app-markets-page',
  imports: [RouterModule, MarketNavComponent],
  templateUrl: './markets.page.html',
  host: { class: 'block' },
})
export class MarketsPage {
  navItems: NavItem[] = [
    {
      path: '.',
      icon: 'globe2',
      label: $localize`:@@featureMarket-marketsPage-navOverview:Übersicht`,
    },
    {
      path: 'screener',
      icon: 'funnel',
      label: $localize`:@@featureMarket-marketsPage-navScreener:Screener`,
    },
    {
      path: 'watchlist',
      icon: 'eye',
      label: $localize`:@@featureMarket-marketsPage-navWatchlist:Watchlist`,
    },
  ];
}
