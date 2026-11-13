import { DestroyRef, Directive, effect, ElementRef, inject, input, Renderer2 } from '@angular/core';

import { ValueFlashDirection } from './value-flash.model';

/** How long the background stays before it fades (US-MK-05: a short highlight). */
export const VALUE_FLASH_MS = 600;

const FLASH_CLASSES: Record<ValueFlashDirection, string> = {
  up: 'motion-safe:bg-up/20',
  down: 'motion-safe:bg-down/20',
};

/**
 * Highlights a changed value for a moment (US-MK-05): the background flashes `up` or `down` when
 * the bound number rises or falls, then fades. The first value and unchanged values don't flash;
 * `enabled` switches it off (setting of AP 6.2), and with "reduce motion" it never shows
 * (`motion-safe:`). The element should be inline-block or block, so that the background has room.
 */
@Directive({
  selector: '[appValueFlash]',
  host: {
    class: 'rounded-sm transition-colors duration-500 motion-reduce:transition-none',
  },
})
export class ValueFlashDirective {
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #renderer = inject(Renderer2);

  appValueFlash = input.required<number | null | undefined>();
  enabled = input(true);

  #previous: number | null | undefined;
  #shown: ValueFlashDirection | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;

  #flash = effect(() => {
    const value = this.appValueFlash();
    const enabled = this.enabled();
    const previous = this.#previous;
    this.#previous = value;
    if (!enabled || !isNumber(value) || !isNumber(previous) || value === previous) {
      return;
    }
    this.#show(value > previous ? 'up' : 'down');
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.#timer));
  }

  #show(direction: ValueFlashDirection): void {
    this.#clear();
    this.#shown = direction;
    this.#renderer.addClass(this.#element.nativeElement, FLASH_CLASSES[direction]);
    this.#renderer.setAttribute(this.#element.nativeElement, 'data-flash', direction);
    this.#timer = setTimeout(() => this.#clear(), VALUE_FLASH_MS);
  }

  #clear(): void {
    clearTimeout(this.#timer);
    if (this.#shown !== null) {
      this.#renderer.removeClass(this.#element.nativeElement, FLASH_CLASSES[this.#shown]);
      this.#renderer.removeAttribute(this.#element.nativeElement, 'data-flash');
      this.#shown = null;
    }
  }
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
