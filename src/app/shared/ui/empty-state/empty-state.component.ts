import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  imports: [],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  /** Bootstrap icon name without the `bi-` prefix. */
  icon = input('inbox');
  heading = input.required<string>();
  text = input<string>();
}
