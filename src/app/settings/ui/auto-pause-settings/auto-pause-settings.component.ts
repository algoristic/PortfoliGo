import { Component, computed, input, output } from '@angular/core';

import {
  AUTO_PAUSE_CODES,
  AutoPauseCode,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CODE_INFO,
} from '@app/notifications/domain/models/notification.model';
import {
  notificationCategoryLabel,
  notificationCodeLabel,
} from '@app/notifications/ui/labels/notification-labels';

import { AutoPauseGroupView, AutoPauseToggle } from './auto-pause-settings.model';

/**
 * Auto-pause per notification code, grouped by category (US-ZT-06, TS §12); part of the game
 * state. `backup-reminder` belongs to the UI and cannot pause the game, so it has no switch.
 */
@Component({
  selector: 'app-auto-pause-settings',
  imports: [],
  templateUrl: './auto-pause-settings.component.html',
  host: { class: 'block' },
})
export class AutoPauseSettingsComponent {
  /** The effective setting of every code; `null` until the first projection of the player. */
  autoPause = input<Record<AutoPauseCode, boolean> | null>();

  toggledAutoPause = output<AutoPauseToggle>();

  groups = computed((): AutoPauseGroupView[] => {
    const settings = this.autoPause();
    return NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      label: notificationCategoryLabel(category),
      switches: AUTO_PAUSE_CODES.filter(
        (code) => NOTIFICATION_CODE_INFO[code].category === category,
      ).map((code) => ({
        code,
        label: notificationCodeLabel(code),
        checked: settings?.[code] ?? false,
      })),
    })).filter((group) => group.switches.length > 0);
  });

  onToggle(code: AutoPauseCode, event: Event): void {
    this.toggledAutoPause.emit({ code, enabled: (event.target as HTMLInputElement).checked });
  }
}
