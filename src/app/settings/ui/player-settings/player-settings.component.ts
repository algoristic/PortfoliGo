import { Component, computed, input, output } from '@angular/core';

import { BackgroundMode } from '@app/engine/domain/models/game-state.model';

import { BackgroundModeOption } from './player-settings.model';

/** Settings of the player, part of the game state (PS US-UI-09): behaviour in the background. */
@Component({
  selector: 'app-player-settings',
  imports: [],
  templateUrl: './player-settings.component.html',
  host: { class: 'block' },
})
export class PlayerSettingsComponent {
  /** `null` until the first clock event of the player. */
  backgroundMode = input<BackgroundMode | null>();

  selectedBackgroundMode = output<BackgroundMode>();

  backgroundModeOptions = computed(() =>
    (
      [
        {
          id: 'realtime',
          label: $localize`:@@uiSettings-playerSettings-realtime:In Echtzeit weiterlaufen (Standard)`,
          hint: $localize`:@@uiSettings-playerSettings-realtimeHint:Ist die App verborgen oder geschlossen, läuft die Spielzeit mit 1 s/s weiter. Beim nächsten Öffnen wird sie nachberechnet.`,
        },
        {
          id: 'pause',
          label: $localize`:@@uiSettings-playerSettings-pause:Pausieren`,
          hint: $localize`:@@uiSettings-playerSettings-pauseHint:Ist die App verborgen oder geschlossen, ruht die Spielzeit. Danach geht sie ohne Nachberechnung weiter.`,
        },
      ] satisfies Omit<BackgroundModeOption, 'checked'>[]
    ).map((option): BackgroundModeOption => ({
      ...option,
      checked: option.id === this.backgroundMode(),
    })),
  );

  onSelectBackgroundMode(mode: BackgroundMode): void {
    this.selectedBackgroundMode.emit(mode);
  }
}
