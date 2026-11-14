import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { DisclaimerHintComponent } from '@app/about/ui/disclaimer-hint/disclaimer-hint.component';
import { ClockFacade } from '@app/clock/feature/state/clock.facade';
import { BackgroundSettingsChange } from '@app/engine/domain/models/game-state.model';
import { SessionFacade } from '@app/engine/feature/state/session.facade';
import { NotificationsFacade } from '@app/notifications/feature/state/notifications.facade';
import { BackupIntervalDays } from '@app/players/domain/models/backup.model';
import { PlayersFacade } from '@app/players/feature/state/players.facade';
import { PlayerBackupComponent } from '@app/players/ui/player-backup/player-backup.component';
import { PwaFacade } from '@app/pwa/feature/state/pwa.facade';
import { AppSettingsComponent } from '@app/pwa/ui/app-settings/app-settings.component';
import { ChangeColorSetting, ColorSchemeSetting } from '@app/settings/domain/models/settings.model';
import { AutoPauseSettingsComponent } from '@app/settings/ui/auto-pause-settings/auto-pause-settings.component';
import { AutoPauseToggle } from '@app/settings/ui/auto-pause-settings/auto-pause-settings.model';
import { DeviceSettingsComponent } from '@app/settings/ui/device-settings/device-settings.component';
import { NotificationChannelSettingsComponent } from '@app/settings/ui/notification-channel-settings/notification-channel-settings.component';
import { NotificationChannelToggle } from '@app/settings/ui/notification-channel-settings/notification-channel-settings.model';
import { PlayerProfileComponent } from '@app/settings/ui/player-profile/player-profile.component';
import { PlayerSettingsComponent } from '@app/settings/ui/player-settings/player-settings.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { Language } from '@app/shared/util/locale';

import { SettingsFacade } from '../state/settings.facade';

/**
 * Settings of this device and of the player (PS US-UI-09): language (US-UI-11), appearance, gain and loss colours,
 * price highlight, shortcuts and notifications per code on the device; name, seed (US-SP-03),
 * background behaviour, auto-pause (US-ZT-06) and the export (US-EX-01) of the player; the app
 * itself: installation (US-UI-07), notification permission (US-BN-04) and storage (US-EX-03).
 */
@Component({
  selector: 'app-settings-page',
  imports: [
    CommonModule,
    PanelComponent,
    DeviceSettingsComponent,
    NotificationChannelSettingsComponent,
    PlayerProfileComponent,
    PlayerSettingsComponent,
    AutoPauseSettingsComponent,
    PlayerBackupComponent,
    AppSettingsComponent,
    DisclaimerHintComponent,
  ],
  templateUrl: './settings.page.html',
  host: { class: 'block' },
})
export class SettingsPage {
  settingsFacade = inject(SettingsFacade);
  sessionFacade = inject(SessionFacade);
  clockFacade = inject(ClockFacade);
  notificationsFacade = inject(NotificationsFacade);
  playersFacade = inject(PlayersFacade);
  pwaFacade = inject(PwaFacade);

  onSelectLanguage(language: Language): void {
    this.settingsFacade.selectLanguage(language);
  }

  onSelectColorScheme(colorScheme: ColorSchemeSetting): void {
    this.settingsFacade.selectColorScheme(colorScheme);
  }

  onSelectChangeColors(changeColors: ChangeColorSetting): void {
    this.settingsFacade.selectChangeColors(changeColors);
  }

  onTogglePriceHighlight(enabled: boolean): void {
    this.settingsFacade.setPriceHighlight(enabled);
  }

  onToggleShortcuts(enabled: boolean): void {
    this.settingsFacade.setShortcutsEnabled(enabled);
  }

  onToggleNotificationChannel({ channel, code, enabled }: NotificationChannelToggle): void {
    this.settingsFacade.setNotificationChannel(channel, code, enabled);
  }

  onRename(): void {
    this.playersFacade.renameOpenPlayer();
  }

  onCopiedSeed(copied: boolean): void {
    this.playersFacade.copiedSeed(copied);
  }

  onSelectBackground(change: BackgroundSettingsChange): void {
    this.clockFacade.setBackground(change);
  }

  onToggleAutoPause({ code, enabled }: AutoPauseToggle): void {
    this.notificationsFacade.setAutoPause(code, enabled);
  }

  onExport(): void {
    this.playersFacade.exportPlayer();
  }

  onSelectBackupInterval(intervalDays: BackupIntervalDays | null): void {
    this.playersFacade.selectBackupInterval(intervalDays);
  }

  onInstall(): void {
    this.pwaFacade.install();
  }

  onRequestNotificationPermission(): void {
    this.pwaFacade.requestNotificationPermission();
  }

  onRequestPersistentStorage(): void {
    this.pwaFacade.requestPersistentStorage();
  }
}
