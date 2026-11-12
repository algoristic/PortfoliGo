import { computed, Directive, input } from '@angular/core';

/** Decorative Bootstrap icon: `<i appIcon="bell" class="text-lg"></i>`; the control around it carries the name. */
@Directive({
  selector: 'i[appIcon]',
  host: { '[class]': 'classes()', 'aria-hidden': 'true' },
})
export class IconDirective {
  /** Bootstrap icon name without the `bi-` prefix. */
  name = input.required<string>({ alias: 'appIcon' });

  // The only place that assembles a class name: Bootstrap Icons come from the global stylesheet,
  // not from Tailwind's source scan, so the name may be dynamic.
  classes = computed(() => `bi bi-${this.name()}`);
}
