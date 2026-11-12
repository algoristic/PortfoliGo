import { Directive } from '@angular/core';

/** Look of an Angular Aria menu (`<div ngMenu appMenu>`); its position stays with the caller. */
@Directive({
  selector: '[appMenu]',
  host: {
    class: 'z-30 min-w-56 rounded-md border border-border bg-surface-raised p-1 shadow-lg',
  },
})
export class MenuDirective {}
