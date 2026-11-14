import { Component, computed, input, output } from '@angular/core';

import { NotificationPermissionState } from '@app/notifications/domain/models/browser-notification.model';
import { InstallOffer, StorageStatus } from '@app/pwa/domain/models/pwa.model';
import { storageUsageRatio } from '@app/pwa/domain/pwa-logic';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatBytesPipe } from '@app/shared/ui/pipes/format-bytes/format-bytes.pipe';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';

import { PreReleaseHintComponent } from '../pre-release-hint/pre-release-hint.component';

/**
 * The app on this device (TS §13): installation (US-UI-07), permission for browser notifications
 * (US-BN-04), storage status (US-EX-03, TS §9.5) and the hint before 1.0 (TS §15).
 */
@Component({
  selector: 'app-app-settings',
  imports: [
    ButtonDirective,
    IconDirective,
    FormatBytesPipe,
    FormatPercentPipe,
    PreReleaseHintComponent,
  ],
  templateUrl: './app-settings.component.html',
  host: { class: 'block' },
})
export class AppSettingsComponent {
  installOffer = input<InstallOffer | null>();
  installing = input<boolean | null>();
  notificationPermission = input<NotificationPermissionState | null>();
  requestingPermission = input<boolean | null>();
  /** `null` until it was read. */
  storage = input<StorageStatus | null>();
  requestingPersistence = input<boolean | null>();

  clickedInstall = output<void>();
  clickedRequestNotificationPermission = output<void>();
  clickedRequestPersistentStorage = output<void>();

  usageRatio = computed(() => {
    const storage = this.storage();
    return storage ? storageUsageRatio(storage.usage, storage.quota) : null;
  });
  permissionText = computed(() => {
    switch (this.notificationPermission()) {
      case 'granted':
        return this.#permissionGranted;
      case 'denied':
        return this.#permissionDenied;
      case 'default':
        return this.#permissionDefault;
      default:
        return this.#permissionUnsupported;
    }
  });
  persistedText = computed(() => {
    switch (this.storage()?.persisted) {
      case true:
        return this.#persistedYes;
      case false:
        return this.#persistedNo;
      default:
        return this.#persistedUnknown;
    }
  });

  #permissionGranted = $localize`:@@uiPwa-appSettings-permissionGranted:Erlaubt`;
  #permissionDenied = $localize`:@@uiPwa-appSettings-permissionDenied:Verweigert – änderbar in den Website-Einstellungen des Browsers`;
  #permissionDefault = $localize`:@@uiPwa-appSettings-permissionDefault:Noch nicht erlaubt`;
  #permissionUnsupported = $localize`:@@uiPwa-appSettings-permissionUnsupported:Von diesem Browser nicht unterstützt`;
  #persistedYes = $localize`:@@uiPwa-appSettings-persistedYes:Ja`;
  #persistedNo = $localize`:@@uiPwa-appSettings-persistedNo:Nein`;
  #persistedUnknown = $localize`:@@uiPwa-appSettings-persistedUnknown:Unbekannt`;

  onInstall(): void {
    this.clickedInstall.emit();
  }

  onRequestNotificationPermission(): void {
    this.clickedRequestNotificationPermission.emit();
  }

  onRequestPersistentStorage(): void {
    this.clickedRequestPersistentStorage.emit();
  }
}
