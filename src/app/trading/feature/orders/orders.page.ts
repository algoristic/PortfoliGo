import { Component } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';

@Component({
  selector: 'app-orders',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './orders.page.html',
  styleUrl: './orders.page.scss',
})
export class OrdersPage {}
