import { Component, computed, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { SavingsPlanId } from '@app/trading/domain/models/savings-plan.model';

import { savingsPlanRow } from '../labels/savings-plan-labels';
import {
  SavingsPlanEntry,
  SavingsPlanPauseChange,
  SavingsPlanRow,
} from '../models/savings-plan.model';

/**
 * The savings plans of the player (US-HD-05, AP 5.6b): instrument (linked to its page), depot,
 * amount, day, next execution or „pausiert“, with the actions change, pause or resume and delete.
 */
@Component({
  selector: 'app-savings-plan-list',
  imports: [
    CardDirective,
    RouterModule,
    BadgeComponent,
    ButtonDirective,
    IconDirective,
    FormatCentsPipe,
    FormatGameTimePipe,
  ],
  templateUrl: './savings-plan-list.component.html',
  host: { class: 'block' },
})
export class SavingsPlanListComponent {
  entries = input.required<SavingsPlanEntry[]>();

  clickedChange = output<SavingsPlanId>();
  clickedPause = output<SavingsPlanPauseChange>();
  clickedDelete = output<SavingsPlanId>();

  rows = computed((): SavingsPlanRow[] => this.entries().map(savingsPlanRow));

  changeLabel = $localize`:@@uiTrading-savingsPlanList-changeLabel:ändern`;
  pauseLabel = $localize`:@@uiTrading-savingsPlanList-pauseLabel:pausieren`;
  resumeLabel = $localize`:@@uiTrading-savingsPlanList-resumeLabel:fortsetzen`;
  deleteLabel = $localize`:@@uiTrading-savingsPlanList-deleteLabel:löschen`;

  onChange(id: SavingsPlanId): void {
    this.clickedChange.emit(id);
  }

  onPause(id: SavingsPlanId, paused: boolean): void {
    this.clickedPause.emit({ id, paused });
  }

  onDelete(id: SavingsPlanId): void {
    this.clickedDelete.emit(id);
  }
}
