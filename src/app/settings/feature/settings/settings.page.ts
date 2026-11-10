import { Component } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';

@Component({
  selector: 'app-settings',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {}
