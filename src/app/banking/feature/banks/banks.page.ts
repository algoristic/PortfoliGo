import { Component } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';

@Component({
  selector: 'app-banks',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './banks.page.html',
  styleUrl: './banks.page.scss',
})
export class BanksPage {}
