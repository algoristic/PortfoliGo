import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FirstStepId } from '@app/dashboard/domain/models/first-steps.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

import { FIRST_STEP_LINKS, firstStepHint, firstStepLabel } from '../labels/dashboard-labels';
import { FirstStepsView } from '../models/dashboard-view.model';

interface StepRow {
  id: FirstStepId;
  done: boolean;
  title: string;
  hint: string;
  link: string;
}

/**
 * „Erste Schritte“ (US-UI-10): the way from the current account to the first security; done
 * steps are ticked, each step links to its page, and the list can be hidden.
 */
@Component({
  selector: 'app-first-steps',
  imports: [RouterLink, PanelComponent, ButtonDirective, IconDirective],
  templateUrl: './first-steps.component.html',
  host: { class: 'block' },
})
export class FirstStepsComponent {
  firstSteps = input.required<FirstStepsView>();

  clickedHide = output<void>();

  rows = computed((): StepRow[] =>
    this.firstSteps().steps.map(({ id, done }) => ({
      id,
      done,
      title: firstStepLabel(id),
      hint: firstStepHint(id),
      link: FIRST_STEP_LINKS[id],
    })),
  );
  progress = computed(() => {
    const { done, steps } = this.firstSteps();
    return $localize`:@@uiDashboard-firstSteps-progress:${done}:done: von ${steps.length}:total: erledigt`;
  });

  heading = $localize`:@@uiDashboard-firstSteps-heading:Erste Schritte`;
  doneLabel = $localize`:@@uiDashboard-firstSteps-done:Erledigt`;
  openLabel = $localize`:@@uiDashboard-firstSteps-open:Offen`;

  onHide(): void {
    this.clickedHide.emit();
  }
}
