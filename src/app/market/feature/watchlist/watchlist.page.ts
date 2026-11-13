import { Component } from '@angular/core';

import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

/** Watchlist tab of the markets area (US-MK-04); its content follows in the rest of AP 4.4. */
@Component({
  selector: 'app-watchlist-page',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './watchlist.page.html',
  host: { class: 'block' },
})
export class WatchlistPage {}
