import { Component } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';

@Component({
  selector: 'app-account-statement',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './account-statement.page.html',
  styleUrl: './account-statement.page.scss',
})
export class AccountStatementPage {}
