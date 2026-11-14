import { Component, input } from '@angular/core';

import { PanelComponent } from '@app/shared/ui/panel/panel.component';

import { ThirdPartyLicense } from '../../domain/models/third-party-license.model';
import { TRADINGVIEW_ATTRIBUTION } from '../../domain/third-party-licenses';

/**
 * Legal notes of the app (US-UI-08, E-26): a game, not investment advice; the versions; the
 * licenses of the shipped libraries with the attribution TradingView requires (E-04).
 */
@Component({
  selector: 'app-legal-notice',
  imports: [PanelComponent],
  templateUrl: './legal-notice.component.html',
  host: { class: 'flex flex-col gap-4' },
})
export class LegalNoticeComponent {
  appVersion = input.required<string>();
  simVersion = input.required<number>();
  licenses = input.required<readonly ThirdPartyLicense[]>();

  attribution = TRADINGVIEW_ATTRIBUTION;
}
