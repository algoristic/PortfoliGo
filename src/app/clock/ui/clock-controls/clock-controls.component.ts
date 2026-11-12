import { Menu, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { Component, computed, input, output } from '@angular/core';

import { SpeedId, SPEEDS } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';
import { MenuItemDirective } from '@app/shared/ui/menu/menu-item.directive';
import { MenuDirective } from '@app/shared/ui/menu/menu.directive';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';

import { ClockMenuAction, SpeedOption } from './clock-controls.model';

import { FormatGameTimePipe } from '../pipes/format-game-time/format-game-time.pipe';

/**
 * Game time with pause, speed, load and jump (PS US-ZT-01–03, US-ZT-05). The clock shows the
 * minute of the last `clock` event; seconds are not shown, so real time needs no interpolation.
 */
@Component({
  selector: 'app-clock-controls',
  imports: [
    Menu,
    MenuItem,
    MenuTrigger,
    BadgeComponent,
    ButtonDirective,
    IconDirective,
    IconButtonDirective,
    MenuDirective,
    MenuItemDirective,
    FormatGameTimePipe,
    FormatPercentPipe,
  ],
  templateUrl: './clock-controls.component.html',
  host: { class: 'flex min-w-0 items-center' },
})
export class ClockControlsComponent {
  /** Game time of the last `clock` event, `null` before the first. */
  tick = input<Tick | null>(null);
  speed = input<SpeedId | null>(null);
  paused = input<boolean | null>(null);
  overloaded = input(false);
  jumping = input(false);
  jumpTargetTick = input<Tick | null>(null);
  /** Share of the jump done (0–1), `null` while unknown. */
  jumpRatio = input<number | null>(null);
  canFaster = input(false);
  canSlower = input(false);
  compact = input(false);

  clickedTogglePause = output<void>();
  selectedSpeed = output<SpeedId>();
  clickedFaster = output<void>();
  clickedSlower = output<void>();
  clickedJump = output<void>();
  clickedCancelJump = output<void>();

  speedOptions: SpeedOption[] = SPEEDS.map(({ id }) => ({ id, label: speedLabel(id) }));

  isDisabled = computed(() => this.tick() === null || this.jumping());
  speedLabel = computed(() => {
    const speed = this.speed();
    return speed === null ? '–' : speedLabel(speed);
  });
  jumpPercent = computed(() => {
    const ratio = this.jumpRatio();
    return ratio === null ? null : Math.round(ratio * 100);
  });

  clockLabel = $localize`:@@uiClock-clockControls-clockLabel:Spielzeit`;
  pauseLabel = $localize`:@@uiClock-clockControls-pause:Pause (Leertaste)`;
  resumeLabel = $localize`:@@uiClock-clockControls-resume:Weiter (Leertaste)`;
  fasterLabel = $localize`:@@uiClock-clockControls-faster:Schneller (+)`;
  slowerLabel = $localize`:@@uiClock-clockControls-slower:Langsamer (−)`;
  speedMenuLabel = $localize`:@@uiClock-clockControls-speedMenu:Geschwindigkeit`;
  jumpLabel = $localize`:@@uiClock-clockControls-jump:Vorspulen`;
  jumpProgressLabel = $localize`:@@uiClock-clockControls-jumpProgress:Fortschritt des Vorspulens`;
  overloadedLabel = $localize`:@@uiClock-clockControls-overloadedHint:Das Gerät kann die gewählte Geschwindigkeit gerade nicht halten. Es wird keine Spielzeit übersprungen.`;

  onTogglePause(): void {
    this.clickedTogglePause.emit();
  }

  onFaster(): void {
    this.clickedFaster.emit();
  }

  onSlower(): void {
    this.clickedSlower.emit();
  }

  onJump(): void {
    this.clickedJump.emit();
  }

  onCancelJump(): void {
    this.clickedCancelJump.emit();
  }

  onSelectMenuItem(value: SpeedId | ClockMenuAction | undefined): void {
    if (value === 'jump') {
      this.clickedJump.emit();
    } else if (value !== undefined) {
      this.selectedSpeed.emit(value);
    }
  }
}

function speedLabel(id: SpeedId): string {
  switch (id) {
    case 'realtime':
      return $localize`:@@uiClock-clockControls-speedRealtime:Echtzeit`;
    case '1min':
      return $localize`:@@uiClock-clockControls-speed1min:1 min/s`;
    case '10min':
      return $localize`:@@uiClock-clockControls-speed10min:10 min/s`;
    case '1h':
      return $localize`:@@uiClock-clockControls-speed1h:1 h/s`;
    case '2h':
      return $localize`:@@uiClock-clockControls-speed2h:2 h/s`;
    case '4h':
      return $localize`:@@uiClock-clockControls-speed4h:4 h/s`;
    case '1d':
      return $localize`:@@uiClock-clockControls-speed1d:1 d/s`;
    case '1w':
      return $localize`:@@uiClock-clockControls-speed1w:1 w/s`;
  }
}
