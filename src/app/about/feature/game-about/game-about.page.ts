import { Component, inject } from '@angular/core';

import { SIM_VERSION } from '@app/engine/domain/version';

import { THIRD_PARTY_LICENSES } from '../../domain/third-party-licenses';
import { LegalNoticeComponent } from '../../ui/legal-notice/legal-notice.component';
import { APP_VERSION } from '../about.config';

/** „Über PortfoliGo“ inside the game area, so reading it doesn't close the game. */
@Component({
  selector: 'app-game-about-page',
  imports: [LegalNoticeComponent],
  templateUrl: './game-about.page.html',
  host: { class: 'block' },
})
export class GameAboutPage {
  appVersion = inject(APP_VERSION);

  simVersion = SIM_VERSION;
  licenses = THIRD_PARTY_LICENSES;
}
