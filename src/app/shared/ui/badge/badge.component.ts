import { Component, computed, input } from '@angular/core';

import { BadgeTone } from './badge.model';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-border text-fg-muted',
  accent: 'border-accent text-accent',
  up: 'border-up text-up',
  down: 'border-down text-down',
  warning: 'border-warning text-warning',
};

@Component({
  selector: 'app-badge',
  imports: [],
  templateUrl: './badge.component.html',
  host: { '[class]': 'classes()' },
})
export class BadgeComponent {
  tone = input<BadgeTone>('neutral');

  classes = computed(
    () =>
      `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${TONE_CLASSES[this.tone()]}`,
  );
}
