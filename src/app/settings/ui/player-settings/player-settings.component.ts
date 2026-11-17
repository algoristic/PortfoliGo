import { Component, computed, input, output } from '@angular/core';

import { SPEEDS } from '@app/clock/domain/models/speed.model';
import { speedLabel } from '@app/clock/ui/labels/speed-labels';
import {
  BACKGROUND_PAUSE_AFTER_MINUTES,
  BackgroundMode,
  BackgroundPauseAfter,
  BackgroundSettings,
  BackgroundSettingsChange,
} from '@app/engine/domain/models/game-state.model';

import { SelectDirective } from '@app/shared/ui/select/select.directive';

import {
  BackgroundModeOption,
  BackgroundPauseAfterOption,
  BackgroundSpeedOption,
} from './player-settings.model';

/**
 * Settings of the player, part of the game state (PS US-UI-09): behaviour in the background with its
 * own speed and the deadline after which a hidden game pauses (TS §3.6).
 */
@Component({
  selector: 'app-player-settings',
  imports: [SelectDirective],
  templateUrl: './player-settings.component.html',
  host: { class: 'block' },
})
export class PlayerSettingsComponent {
  /** `null` until the first clock event of the player. */
  background = input<BackgroundSettings | null>();

  selectedBackground = output<BackgroundSettingsChange>();

  mode = computed(() => this.background()?.mode ?? null);

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
        {
          id: 'keep-speed',
          label: $localize`:@@uiSettings-playerSettings-keepSpeed:Gewählte Geschwindigkeit beibehalten`,
          hint: $localize`:@@uiSettings-playerSettings-keepSpeedHint:Ist die App verborgen, läuft die Spielzeit so schnell weiter wie gerade gewählt.`,
        },
        {
          id: 'custom-speed',
          label: $localize`:@@uiSettings-playerSettings-customSpeed:Eigene Geschwindigkeit`,
          hint: $localize`:@@uiSettings-playerSettings-customSpeedHint:Ist die App verborgen, läuft die Spielzeit mit der Geschwindigkeit, die du hier wählst.`,
        },
      ] satisfies Omit<BackgroundModeOption, 'checked'>[]
    ).map((option): BackgroundModeOption => ({ ...option, checked: option.id === this.mode() })),
  );

  /** All levels of TS §3.4; shown only in `custom-speed`. */
  speedOptions = computed(() =>
    SPEEDS.map(({ id }): BackgroundSpeedOption => ({
      id,
      label: speedLabel(id),
      selected: id === this.background()?.speed,
    })),
  );

  /** Off and the deadlines of TS §3.6; shown in every mode but `pause`. */
  pauseAfterOptions = computed(() =>
    ([null, ...BACKGROUND_PAUSE_AFTER_MINUTES] as const).map(
      (pauseAfter): BackgroundPauseAfterOption => ({
        value: pauseAfter === null ? 'off' : String(pauseAfter),
        pauseAfter,
        label: pauseAfterLabel(pauseAfter),
        selected: pauseAfter === this.background()?.pauseAfter,
      }),
    ),
  );

  showSpeed = computed(() => this.mode() === 'custom-speed');
  showPauseAfter = computed(() => this.mode() !== null && this.mode() !== 'pause');

  onSelectMode(mode: BackgroundMode): void {
    this.selectedBackground.emit({ mode });
  }

  onSelectSpeed(event: Event): void {
    const mode = this.mode();
    const speed = this.speedOptions().find(
      ({ id }) => id === (event.target as HTMLSelectElement).value,
    )?.id;
    if (mode !== null && speed !== undefined) {
      this.selectedBackground.emit({ mode, speed });
    }
  }

  onSelectPauseAfter(event: Event): void {
    const mode = this.mode();
    const option = this.pauseAfterOptions().find(
      ({ value }) => value === (event.target as HTMLSelectElement).value,
    );
    if (mode !== null && option !== undefined) {
      this.selectedBackground.emit({ mode, pauseAfter: option.pauseAfter });
    }
  }
}

function pauseAfterLabel(pauseAfter: BackgroundPauseAfter): string {
  switch (pauseAfter) {
    case null:
      return $localize`:@@uiSettings-playerSettings-pauseAfterOff:Nie`;
    case 15:
      return $localize`:@@uiSettings-playerSettings-pauseAfter15:nach 15 Minuten`;
    case 30:
      return $localize`:@@uiSettings-playerSettings-pauseAfter30:nach 30 Minuten`;
    case 60:
      return $localize`:@@uiSettings-playerSettings-pauseAfter60:nach 1 Stunde`;
    case 120:
      return $localize`:@@uiSettings-playerSettings-pauseAfter120:nach 2 Stunden`;
    case 240:
      return $localize`:@@uiSettings-playerSettings-pauseAfter240:nach 4 Stunden`;
    case 480:
      return $localize`:@@uiSettings-playerSettings-pauseAfter480:nach 8 Stunden`;
  }
}
