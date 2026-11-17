import { Component, input } from '@angular/core';

import { CardDirective } from '../card/card.directive';

/** Framed area of a page with an optional title; `[panelActions]` goes into the title row. */
@Component({
  selector: 'app-panel',
  imports: [CardDirective],
  templateUrl: './panel.component.html',
  host: { class: 'block' },
})
export class PanelComponent {
  heading = input<string>();
}
