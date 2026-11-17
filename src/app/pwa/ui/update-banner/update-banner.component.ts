import { Component, input, output } from '@angular/core';

import { AppUpdateEvent } from '@app/pwa/domain/models/pwa.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

/**
 * Notice of the service worker (US-UI-07, TS §13): a new version is ready, or the cached version is
 * broken; both offer to reload. Floats above the bottom navigation of phones.
 */
@Component({
  selector: 'app-update-banner',
  imports: [CardDirective, ButtonDirective, IconDirective],
  templateUrl: './update-banner.component.html',
  host: { class: 'block' },
})
export class UpdateBannerComponent {
  update = input<AppUpdateEvent | null>();

  clickedReload = output<void>();

  onReload(): void {
    this.clickedReload.emit();
  }
}
