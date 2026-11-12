import { Component } from '@angular/core';

import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

@Component({
  selector: 'app-settings-page',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './settings.page.html',
  host: { class: 'block' },
})
export class SettingsPage {}
