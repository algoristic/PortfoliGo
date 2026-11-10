import { computed, Directive, input } from '@angular/core';

import { ButtonSize, ButtonVariant } from './button.model';

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-bg hover:opacity-90',
  secondary: 'border border-border bg-surface-raised text-fg hover:bg-surface',
  ghost: 'text-fg hover:bg-surface-raised',
  danger: 'bg-down text-bg hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

// A directive on native `<button>`/`<a>` elements keeps their semantics and keyboard behaviour.
@Directive({
  selector: 'button[appButton], a[appButton]',
  host: { '[class]': 'classes()' },
})
export class ButtonDirective {
  variant = input<ButtonVariant>('secondary');
  size = input<ButtonSize>('md');

  classes = computed(
    () => `${BASE_CLASSES} ${VARIANT_CLASSES[this.variant()]} ${SIZE_CLASSES[this.size()]}`,
  );
}
