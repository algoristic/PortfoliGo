import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { VALUE_FLASH_MS, ValueFlashDirective } from './value-flash.directive';

@Component({
  imports: [ValueFlashDirective],
  template: `<span data-testid="value" [appValueFlash]="value()" [enabled]="enabled()">x</span>`,
})
class HostComponent {
  value = signal<number | null>(null);
  enabled = signal(true);
}

describe('ValueFlashDirective', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function render(): {
    host: HostComponent;
    element: HTMLElement;
    set: (value: number | null) => void;
  } {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement.querySelector('[data-testid="value"]') as HTMLElement;
    const host = fixture.componentInstance;
    return {
      host,
      element,
      set: (value) => {
        host.value.set(value);
        fixture.detectChanges();
      },
    };
  }

  it('flashes up or down when the value rises or falls and fades after a moment', () => {
    const { element, set } = render();
    set(10);
    expect(element.dataset['flash']).toBeUndefined();

    set(10.5);
    expect(element.dataset['flash']).toBe('up');
    expect(element.classList).toContain('motion-safe:bg-up/20');

    set(10.2);
    expect(element.dataset['flash']).toBe('down');
    expect(element.classList).not.toContain('motion-safe:bg-up/20');
    expect(element.classList).toContain('motion-safe:bg-down/20');

    vi.advanceTimersByTime(VALUE_FLASH_MS - 1);
    expect(element.dataset['flash']).toBe('down');
    vi.advanceTimersByTime(1);
    expect(element.dataset['flash']).toBeUndefined();
    expect(element.classList).not.toContain('motion-safe:bg-down/20');
  });

  it('does not flash for the same value, a missing one or when it is switched off', () => {
    const { host, element, set } = render();
    set(10);
    set(10);
    expect(element.dataset['flash']).toBeUndefined();
    set(null);
    set(11);
    expect(element.dataset['flash']).toBeUndefined();

    host.enabled.set(false);
    set(12);
    expect(element.dataset['flash']).toBeUndefined();
  });
});
