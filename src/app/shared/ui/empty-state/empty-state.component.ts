import { Component, input } from '@angular/core';

import { IconDirective } from '../icon/icon.directive';

@Component({
  selector: 'app-empty-state',
  imports: [IconDirective],
  templateUrl: './empty-state.component.html',
  host: { class: 'block' },
})
export class EmptyStateComponent {
  /** Bootstrap icon name without the `bi-` prefix. */
  icon = input('inbox');
  heading = input.required<string>();
  text = input<string>();
}
