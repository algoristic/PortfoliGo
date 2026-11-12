import { Component, input } from '@angular/core';

/** Framed area of a page with an optional title; `[panelActions]` goes into the title row. */
@Component({
  selector: 'app-panel',
  imports: [],
  templateUrl: './panel.component.html',
  host: { class: 'block' },
})
export class PanelComponent {
  heading = input<string>();
}
