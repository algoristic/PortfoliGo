import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { NavItem } from '@app/shared/ui/nav-link/nav-item.model';
import { NavLinkDirective } from '@app/shared/ui/nav-link/nav-link.directive';

/** Tabs of the markets area (TS §11.4): overview, screener and watchlist as child routes. */
@Component({
  selector: 'app-market-nav',
  imports: [RouterModule, IconDirective, NavLinkDirective],
  templateUrl: './market-nav.component.html',
  host: { class: 'block' },
})
export class MarketNavComponent {
  items = input.required<NavItem[]>();

  navLabel = $localize`:@@uiMarket-marketNav-navLabel:Märkte-Navigation`;
}
