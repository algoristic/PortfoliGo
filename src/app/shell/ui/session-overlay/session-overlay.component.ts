import { CdkTrapFocus } from '@angular/cdk/a11y';
import { afterNextRender, Component, computed, ElementRef, input, viewChild } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SessionStatus } from '@app/engine/domain/models/session.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';

/**
 * Covers the game area while the game loads, catches up (TS §3.7) or can't run (other tab, error).
 * The focus moves into it; progress steps are not announced (TS §11.10).
 */
@Component({
  selector: 'app-session-overlay',
  imports: [RouterModule, CdkTrapFocus, ButtonDirective, IconDirective, FormatPercentPipe],
  templateUrl: './session-overlay.component.html',
  host: { class: 'block' },
})
export class SessionOverlayComponent {
  status = input.required<SessionStatus>();
  /** Share of the catch-up done (0–1), `null` while unknown. */
  progress = input<number | null>(null);

  dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');

  percent = computed(() => {
    const progress = this.progress();
    return progress === null ? null : Math.round(progress * 100);
  });
  isEnded = computed(() => this.status() === 'locked' || this.status() === 'failed');

  progressLabel = $localize`:@@uiShell-sessionOverlay-progressLabel:Fortschritt`;

  constructor() {
    // The game area behind is inert; the focus moves into the overlay so it is read first.
    afterNextRender(() => this.dialog().nativeElement.focus());
  }
}
