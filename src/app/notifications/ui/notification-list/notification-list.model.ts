import { NotificationSeverity } from '@app/notifications/domain/models/notification.model';
import { BadgeTone } from '@app/shared/ui/badge/badge.model';

/** Icon and colour per severity, so that it is distinguishable without colour (US-UI-02). */
export const SEVERITY_ICONS: Readonly<
  Record<NotificationSeverity, { icon: string; color: string }>
> = {
  hint: { icon: 'lightbulb', color: 'text-fg-muted' },
  info: { icon: 'info-circle', color: 'text-accent' },
  warning: { icon: 'exclamation-triangle', color: 'text-warning' },
  critical: { icon: 'exclamation-octagon', color: 'text-down' },
};

/** Badge of the severity: critical in the colour of losses, warnings in the warning colour. */
export const SEVERITY_TONES: Readonly<Record<NotificationSeverity, BadgeTone>> = {
  hint: 'neutral',
  info: 'neutral',
  warning: 'warning',
  critical: 'down',
};

export interface NotificationRowView {
  seq: number;
  tick: number;
  read: boolean;
  title: string;
  text: string;
  categoryLabel: string;
  severity: NotificationSeverity;
  severityLabel: string;
  severityTone: BadgeTone;
  markReadLabel: string;
}
