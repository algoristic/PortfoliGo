import { NotificationChannel } from '@app/notifications/domain/models/notification-channel.model';
import {
  NotificationCategory,
  NotificationCode,
} from '@app/notifications/domain/models/notification.model';

export interface NotificationChannelToggle {
  channel: NotificationChannel;
  code: NotificationCode;
  enabled: boolean;
}

export interface NotificationChannelSwitchView {
  channel: NotificationChannel;
  checked: boolean;
  /** Accessible name: „<Ereignis>: Einblendung“ or „<Ereignis>: Browser“. */
  label: string;
}

export interface NotificationChannelRowView {
  code: NotificationCode;
  label: string;
  toast: NotificationChannelSwitchView;
  /** `null` for codes without browser notification (`backup-reminder`). */
  browser: NotificationChannelSwitchView | null;
}

/** The codes of one category of TS §12. */
export interface NotificationChannelGroupView {
  category: NotificationCategory;
  label: string;
  rows: NotificationChannelRowView[];
}
