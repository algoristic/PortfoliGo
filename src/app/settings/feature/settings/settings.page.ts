import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ClockFacade } from '@app/clock/feature/state/clock.facade';
import { BackgroundSettingsChange } from '@app/engine/domain/models/game-state.model';
import { NotificationsFacade } from '@app/notifications/feature/state/notifications.facade';
import { ColorSchemeSetting } from '@app/settings/domain/models/settings.model';
import { AutoPauseSettingsComponent } from '@app/settings/ui/auto-pause-settings/auto-pause-settings.component';
import { AutoPauseToggle } from '@app/settings/ui/auto-pause-settings/auto-pause-settings.model';
import { DeviceSettingsComponent } from '@app/settings/ui/device-settings/device-settings.component';
import { PlayerSettingsComponent } from '@app/settings/ui/player-settings/player-settings.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

import { SettingsFacade } from '../state/settings.facade';

/**
 * Settings of this device and of the player (PS US-UI-09, US-ZT-06); AP 6.2 completes the page.
 */
@Component({
  selector: 'app-settings-page',
  imports: [
    CommonModule,
    PanelComponent,
    DeviceSettingsComponent,
    PlayerSettingsComponent,
    AutoPauseSettingsComponent,
  ],
  templateUrl: './settings.page.html',
  host: { class: 'block' },
})
export class SettingsPage {
  settingsFacade = inject(SettingsFacade);
  clockFacade = inject(ClockFacade);
  notificationsFacade = inject(NotificationsFacade);

  onSelectColorScheme(colorScheme: ColorSchemeSetting): void {
    this.settingsFacade.selectColorScheme(colorScheme);
  }

  onToggleShortcuts(enabled: boolean): void {
    this.settingsFacade.setShortcutsEnabled(enabled);
  }

  onSelectBackground(change: BackgroundSettingsChange): void {
    this.clockFacade.setBackground(change);
  }

  onToggleAutoPause({ code, enabled }: AutoPauseToggle): void {
    this.notificationsFacade.setAutoPause(code, enabled);
  }
}
