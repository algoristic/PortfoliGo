import { Component, input, output } from '@angular/core';

import { Toast, ToastTone } from './toast.model';

import { CardDirective } from '../card/card.directive';
import { IconDirective } from '../icon/icon.directive';

const TONE_CLASSES: Record<ToastTone, string> = {
  info: 'text-accent',
  success: 'text-up',
  warning: 'text-warning',
  error: 'text-down',
};

const TONE_ICONS: Record<ToastTone, string> = {
  info: 'info-circle',
  success: 'check-circle',
  warning: 'exclamation-triangle',
  error: 'x-octagon',
};

@Component({
  selector: 'app-toast-container',
  imports: [CardDirective, IconDirective],
  templateUrl: './toast-container.component.html',
  host: { class: 'block w-full' },
})
export class ToastContainerComponent {
  toasts = input<Toast[]>([]);

  toneClasses = TONE_CLASSES;
  toneIcons = TONE_ICONS;

  dismissedToast = output<number>();

  // The icon is decorative; screen readers hear the tone as a word before the message.
  toneLabels: Record<ToastTone, string> = {
    info: $localize`:@@uiShared-toastContainer-toneInfo:Hinweis:`,
    success: $localize`:@@uiShared-toastContainer-toneSuccess:Erledigt:`,
    warning: $localize`:@@uiShared-toastContainer-toneWarning:Warnung:`,
    error: $localize`:@@uiShared-toastContainer-toneError:Fehler:`,
  };
  dismissLabel = $localize`:@@uiShared-toastContainer-dismiss:Hinweis schließen`;

  onDismiss(toastId: number): void {
    this.dismissedToast.emit(toastId);
  }
}
