import { Component } from '@angular/core';

import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';

@Component({
  selector: 'app-instrument',
  imports: [PanelComponent, EmptyStateComponent],
  templateUrl: './instrument.page.html',
  styleUrl: './instrument.page.scss',
})
export class InstrumentPage {}
