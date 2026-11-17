import { computed, Directive, input } from '@angular/core';

import { CardPadding, CardSurface } from './card.model';

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const SURFACE_CLASSES: Record<CardSurface, string> = {
  default: 'bg-surface',
  raised: 'bg-surface-raised',
};

// A directive keeps the host's semantics (`section`, `article`, `li`, `dl`); layout stays with the caller.
@Directive({
  selector: '[appCard]',
  host: { '[class]': 'classes()' },
})
export class CardDirective {
  padding = input<CardPadding>('md');
  surface = input<CardSurface>('default');

  classes = computed(() =>
    `rounded-lg border border-border ${SURFACE_CLASSES[this.surface()]} ${PADDING_CLASSES[this.padding()]}`.trim(),
  );
}
