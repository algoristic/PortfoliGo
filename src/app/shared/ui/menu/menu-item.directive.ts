import { computed, Directive, input } from '@angular/core';

const BASE_CLASSES =
  'flex items-center gap-3 rounded px-3 py-2 text-sm current:font-medium current:text-accent';
const ENABLED_CLASSES = 'cursor-pointer hover:bg-surface focus-visible:bg-surface';
const DISABLED_CLASSES = 'cursor-not-allowed text-fg-muted';

/**
 * Look of an Angular Aria menu item (`<div ngMenuItem appMenuItem>`). `active` marks the current
 * page with `aria-current`; `disabled` also reaches Aria's `ngMenuItem`.
 */
@Directive({
  selector: '[appMenuItem]',
  host: {
    '[class]': 'classes()',
    '[attr.aria-current]': "active() ? 'page' : null",
  },
})
export class MenuItemDirective {
  active = input(false);
  disabled = input(false);

  classes = computed(
    () => `${BASE_CLASSES} ${this.disabled() ? DISABLED_CLASSES : ENABLED_CLASSES}`,
  );
}
