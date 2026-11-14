import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { Component, computed, ElementRef, input, signal, viewChild } from '@angular/core';
import { RouterModule } from '@angular/router';

import { IconDirective } from '../icon/icon.directive';
import { IconButtonDirective } from '../icon-button/icon-button.directive';

const POPOVER_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
];

/**
 * Context help „?“ next to a term (PS US-UI-06): a 24 px button opens a small non-modal popover
 * with a short explanation and, with `link`, „Mehr im Glossar“. The focus moves into the popover
 * and back to the button when it closes (Escape, click outside, close button).
 */
@Component({
  selector: 'app-help-hint',
  imports: [
    RouterModule,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    CdkTrapFocus,
    IconDirective,
    IconButtonDirective,
  ],
  templateUrl: './help-hint.component.html',
  host: { class: 'inline-flex align-middle' },
})
export class HelpHintComponent {
  /** The explained term: name of the popover and part of the button label. */
  term = input.required<string>();
  text = input.required<string>();
  /** Router link of the glossary; without it the popover has no link. */
  link = input<string | null>(null);
  fragment = input<string>();
  testId = input('help-hint');

  positions = POPOVER_POSITIONS;

  origin = viewChild.required<ElementRef<HTMLElement>>('origin');

  expanded = signal(false);
  buttonLabel = computed(
    () => $localize`:@@uiShared-helpHint-buttonLabel:Erklärung: ${this.term()}:term:`,
  );

  closeLabel = $localize`:@@uiShared-helpHint-close:Schließen`;

  onToggle(): void {
    this.expanded.update((expanded) => !expanded);
  }

  onClose(): void {
    this.expanded.set(false);
  }

  // A click on the button toggles the popover itself.
  onOutsideClick(event: MouseEvent): void {
    if (!(event.target instanceof Node && this.origin().nativeElement.contains(event.target))) {
      this.onClose();
    }
  }
}
