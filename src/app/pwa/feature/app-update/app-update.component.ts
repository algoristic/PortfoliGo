import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { UpdateBannerComponent } from '@app/pwa/ui/update-banner/update-banner.component';

import { PwaFacade } from '../state/pwa.facade';

/** The notice of a new or broken version on every page (US-UI-07, TS §13). */
@Component({
  selector: 'app-app-update',
  imports: [CommonModule, UpdateBannerComponent],
  templateUrl: './app-update.component.html',
  host: { class: 'contents' },
})
export class AppUpdateComponent {
  pwaFacade = inject(PwaFacade);

  onReload(): void {
    this.pwaFacade.reload();
  }
}
