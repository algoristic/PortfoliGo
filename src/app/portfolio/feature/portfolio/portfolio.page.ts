import { Component } from '@angular/core';

import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

@Component({
  selector: 'app-portfolio-page',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './portfolio.page.html',
  host: { class: 'block' },
})
export class PortfolioPage {}
