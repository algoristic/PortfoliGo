import { Component } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';

@Component({
  selector: 'app-dashboard',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {}
