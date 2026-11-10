import { Component } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';

@Component({
  selector: 'app-taxes',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './taxes.page.html',
  styleUrl: './taxes.page.scss',
})
export class TaxesPage {}
