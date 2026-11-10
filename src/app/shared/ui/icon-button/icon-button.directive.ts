import { computed, Directive, input } from '@angular/core';

import { ButtonSize } from '../button/button.model';

const BASE_CLASSES =
  'inline-flex shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'size-8 text-base',
  md: 'size-10 text-lg',
};

/** Icon-only button; `label` is its accessible name and tooltip. */
@Directive({
  selector: 'button[appIconButton], a[appIconButton]',
  host: {
    '[class]': 'classes()',
    '[attr.aria-label]': 'label()',
    '[attr.title]': 'label()',
  },
})
export class IconButtonDirective {
  label = input.required<string>();
  size = input<ButtonSize>('md');

  classes = computed(() => `${BASE_CLASSES} ${SIZE_CLASSES[this.size()]}`);
}
