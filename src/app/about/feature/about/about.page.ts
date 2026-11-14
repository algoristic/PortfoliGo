import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SIM_VERSION } from '@app/engine/domain/version';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

import { THIRD_PARTY_LICENSES } from '../../domain/third-party-licenses';
import { LegalNoticeComponent } from '../../ui/legal-notice/legal-notice.component';
import { APP_VERSION } from '../about.config';

@Component({
  selector: 'app-about-page',
  imports: [RouterModule, IconDirective, LegalNoticeComponent],
  templateUrl: './about.page.html',
  host: { class: 'block' },
})
export class AboutPage {
  appVersion = inject(APP_VERSION);

  simVersion = SIM_VERSION;
  licenses = THIRD_PARTY_LICENSES;
}
