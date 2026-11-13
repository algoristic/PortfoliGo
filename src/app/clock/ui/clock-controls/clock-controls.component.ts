import { Menu, MenuItem, MenuTrigger } from '@angular/aria/menu';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  viewChild,
} from '@angular/core';

import { GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { SpeedId, SPEEDS } from '@app/clock/domain/models/speed.model';
import { DAYS_PER_WEEK, Tick, TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { AutoPauseCode } from '@app/notifications/domain/models/notification.model';
import { notificationCodeLabel } from '@app/notifications/ui/labels/notification-labels';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { focusIfLost } from '@app/shared/ui/focus/focus-if-lost';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';
import { MenuItemDirective } from '@app/shared/ui/menu/menu-item.directive';
import { MenuDirective } from '@app/shared/ui/menu/menu.directive';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';

import { ClockMenuAction, SpeedOption } from './clock-controls.model';

import { FormatGameTimePipe } from '../pipes/format-game-time/format-game-time.pipe';

/**
 * Game time with pause, speed, load and jump (PS US-ZT-01–03, US-ZT-05) and the reason of an
 * auto-pause (US-ZT-06; on phones only the icon, the text for screen readers). The clock shows the
 * minute of the last `clock` event; seconds are not shown, so real time needs no interpolation.
 * The clock keeps the width of its widest weekday and the status chip follows the buttons, so the
 * pause button stays in place when the weekday or the pause changes (AP 5.9).
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
  readonly #injector = inject(Injector);

  /** Game time of the last `clock` event, `null` before the first. */
  tick = input<Tick | null>(null);
  speed = input<SpeedId | null>(null);
  paused = input<boolean | null>(null);
  /** Code of the notification an auto-pause stopped at, while it holds the game (TS §3.6). */
  autoPauseCode = input<AutoPauseCode | null>(null);
  overloaded = input(false);
  jumping = input(false);
  jumpTargetTick = input<Tick | null>(null);
  /** Share of the jump done (0–1), `null` while unknown. */
  jumpRatio = input<number | null>(null);
  canFaster = input(false);
  canSlower = input(false);
  compact = input(false);
  /** Whether the clock shortcuts are on; when off, labels and `aria-keyshortcuts` omit them. */
  shortcutsEnabled = input(true);

  clickedTogglePause = output<void>();
  selectedSpeed = output<SpeedId>();
  clickedFaster = output<void>();
  clickedSlower = output<void>();
  clickedJump = output<void>();
  clickedCancelJump = output<void>();

  togglePauseButton = viewChild<ElementRef<HTMLButtonElement>>('togglePause');
  cancelJumpButton = viewChild<ElementRef<HTMLButtonElement>>('cancelJump');

  speedOptions: SpeedOption[] = SPEEDS.map(({ id }) => ({ id, label: speedLabel(id) }));
  /**
   * One tick per weekday; the clock reserves the width of the widest. Only the weekday changes the
   * width, because day, month, year and time always have the same number of tabular digits.
   */
  weekTicks: Tick[] = Array.from(
    { length: DAYS_PER_WEEK },
    (_, day) => GAME_START_TICK + day * TICKS_PER_DAY,
  );

  isDisabled = computed(() => this.tick() === null || this.jumping());
  speedLabel = computed(() => {
    const speed = this.speed();
    return speed === null ? '–' : speedLabel(speed);
  });
  pausedLabel = computed(() => {
    const code = this.autoPauseCode();
    return code === null
      ? this.pausedText
      : $localize`:@@uiClock-clockControls-autoPaused:Pausiert: ${notificationCodeLabel(code)}:reason:`;
  });
  pausedIcon = computed(() =>
    this.autoPauseCode() === null ? 'pause-fill' : 'exclamation-triangle-fill',
  );
  /** The reason as a tooltip too, because phones show only the icon. */
  pausedTitle = computed(() => (this.autoPauseCode() === null ? null : this.pausedLabel()));
  jumpPercent = computed(() => {
    const ratio = this.jumpRatio();
    return ratio === null ? null : Math.round(ratio * 100);
  });
  toggleLabel = computed(() => {
    const shortcuts = this.shortcutsEnabled();
    if (this.paused()) {
      return shortcuts ? this.resumeShortcutLabel : this.resumeLabel;
    }
    return shortcuts ? this.pauseShortcutLabel : this.pauseLabel;
  });
  fasterButtonLabel = computed(() =>
    this.shortcutsEnabled() ? this.fasterShortcutLabel : this.fasterLabel,
  );
  slowerButtonLabel = computed(() =>
    this.shortcutsEnabled() ? this.slowerShortcutLabel : this.slowerLabel,
  );

  clockLabel = $localize`:@@uiClock-clockControls-clockLabel:Spielzeit`;
  pausedText = $localize`:@@uiClock-clockControls-paused:Pausiert`;
  pauseShortcutLabel = $localize`:@@uiClock-clockControls-pause:Pause (Leertaste)`;
  resumeShortcutLabel = $localize`:@@uiClock-clockControls-resume:Weiter (Leertaste)`;
  fasterShortcutLabel = $localize`:@@uiClock-clockControls-faster:Schneller (+)`;
  slowerShortcutLabel = $localize`:@@uiClock-clockControls-slower:Langsamer (−)`;
  pauseLabel = $localize`:@@uiClock-clockControls-pauseWithoutShortcut:Pause`;
  resumeLabel = $localize`:@@uiClock-clockControls-resumeWithoutShortcut:Weiter`;
  fasterLabel = $localize`:@@uiClock-clockControls-fasterWithoutShortcut:Schneller`;
  slowerLabel = $localize`:@@uiClock-clockControls-slowerWithoutShortcut:Langsamer`;
  speedMenuLabel = $localize`:@@uiClock-clockControls-speedMenu:Geschwindigkeit`;
  jumpLabel = $localize`:@@uiClock-clockControls-jump:Vorspulen`;
  jumpProgressLabel = $localize`:@@uiClock-clockControls-jumpProgress:Fortschritt des Vorspulens`;
  overloadedLabel = $localize`:@@uiClock-clockControls-overloadedHint:Das Gerät kann die gewählte Geschwindigkeit gerade nicht halten. Es wird keine Spielzeit übersprungen.`;

  constructor() {
    // Starting or ending a jump removes the focused control (jump button, menu or cancel), so the
    // focus moves to the control that replaces it instead of falling back to `<body>`.
    let wasJumping = false;
    effect(() => {
      const isJumping = this.jumping();
      if (isJumping !== wasJumping) {
        focusIfLost(
          this.#injector,
          () => (isJumping ? this.cancelJumpButton() : this.togglePauseButton())?.nativeElement,
        );
      }
      wasJumping = isJumping;
    });
  }

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
