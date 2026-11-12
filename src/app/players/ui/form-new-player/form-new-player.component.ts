import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { form, FormField, FormRoot } from '@angular/forms/signals';
import { RouterModule } from '@angular/router';

import { NewPlayer, PlayerPresetId } from '@app/players/domain/models/player.model';
import { DEFAULT_START_CONDITIONS, PLAYER_PRESETS } from '@app/players/domain/player-limits';
import { livingCostsExceedIncome, matchingPreset } from '@app/players/domain/player-logic';
import { AmountInputComponent } from '@app/shared/ui/amount-input/amount-input.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

import { NewPlayerFormModel } from '../models/new-player-form.model';
import { newPlayerSchema } from '../schemas/new-player-schema';

/** Form „Spieler anlegen“ (PS US-SP-01); the feature layer creates the player. */
@Component({
  selector: 'app-form-new-player',
  imports: [
    RouterModule,
    FormField,
    FormRoot,
    AmountInputComponent,
    ButtonDirective,
    IconDirective,
  ],
  templateUrl: './form-new-player.component.html',
  host: { class: 'block' },
})
export class FormNewPlayerComponent {
  /** Suggested seed; a new suggestion replaces only the seed, not the other entries. */
  seed = input.required<string>();
  creating = input(false);

  presets = PLAYER_PRESETS;

  submittedNewPlayer = output<NewPlayer>();
  clickedSuggestSeed = output<void>();

  newPlayerModel = linkedSignal<string, NewPlayerFormModel>({
    source: this.seed,
    computation: (seed, previous) => ({
      ...(previous?.value ?? { name: '', ...DEFAULT_START_CONDITIONS }),
      seed,
    }),
  });
  newPlayerForm = form(this.newPlayerModel, newPlayerSchema, {
    submission: {
      action: async (field) => this.submittedNewPlayer.emit(toNewPlayer(field().value())),
    },
  });

  activePreset = computed(() => {
    const { startCapital, netIncome, livingCosts } = this.newPlayerModel();
    return startCapital === null || netIncome === null || livingCosts === null
      ? null
      : matchingPreset({ startCapital, netIncome, livingCosts });
  });
  showLivingCostsHint = computed(() => {
    const { netIncome, livingCosts } = this.newPlayerModel();
    return livingCostsExceedIncome(netIncome, livingCosts);
  });

  presetLabels: Record<PlayerPresetId, string> = {
    student: $localize`:@@uiPlayers-formNewPlayer-presetStudent:Studium`,
    'career-start': $localize`:@@uiPlayers-formNewPlayer-presetCareerStart:Berufseinstieg`,
    experienced: $localize`:@@uiPlayers-formNewPlayer-presetExperienced:Erfahren`,
  };

  onSuggestSeed(): void {
    this.clickedSuggestSeed.emit();
  }

  onApplyPreset(presetId: PlayerPresetId): void {
    const preset = PLAYER_PRESETS.find(({ id }) => id === presetId);
    if (preset !== undefined) {
      this.newPlayerModel.update((model) => ({ ...model, ...preset.start }));
    }
  }
}

// The schema requires all amounts, so a submitted model has none missing.
function toNewPlayer(model: NewPlayerFormModel): NewPlayer {
  return {
    name: model.name,
    seed: model.seed,
    start: {
      startCapital: model.startCapital ?? 0,
      netIncome: model.netIncome ?? 0,
      livingCosts: model.livingCosts ?? 0,
    },
  };
}
