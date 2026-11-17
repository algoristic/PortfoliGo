import { Directive } from '@angular/core';

// Wide tables scroll inside this frame, so it has to be reachable by keyboard; the caller binds
// `aria-label` and combines it with `appCard padding="none"` for the frame.
@Directive({
  selector: '[appTableScroll]',
  host: {
    role: 'region',
    tabindex: '0',
    class:
      'overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  },
})
export class TableScrollDirective {}
