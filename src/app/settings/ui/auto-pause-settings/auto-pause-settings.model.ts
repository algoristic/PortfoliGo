import {
  AutoPauseCode,
  NotificationCategory,
} from '@app/notifications/domain/models/notification.model';

export interface AutoPauseToggle {
  code: AutoPauseCode;
  enabled: boolean;
}

export interface AutoPauseSwitchView {
  code: AutoPauseCode;
  label: string;
  checked: boolean;
}

/** The switches of one category of TS §12. */
export interface AutoPauseGroupView {
  category: NotificationCategory;
  label: string;
  switches: AutoPauseSwitchView[];
}
