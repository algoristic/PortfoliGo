import { Component } from '@angular/core';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';

/**
 * Before 1.0 there is no compatibility promise, and the service worker activates new versions with
 * the next start (TS §15, US-UI-07). The public release (M16) removes the hint.
 */
@Component({
  selector: 'app-pre-release-hint',
  imports: [IconDirective],
  templateUrl: './pre-release-hint.component.html',
  host: { class: 'block' },
})
export class PreReleaseHintComponent {}
