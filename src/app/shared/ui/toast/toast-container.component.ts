import { Component, input, output } from '@angular/core';

import { Toast, ToastTone } from './toast.model';

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
  imports: [IconDirective],
  templateUrl: './toast-container.component.html',
  host: { class: 'block w-full' },
})
export class ToastContainerComponent {
  toasts = input<Toast[]>([]);

  toneClasses = TONE_CLASSES;
  toneIcons = TONE_ICONS;

  dismissedToast = output<number>();

  dismissLabel = $localize`:@@uiShared-toastContainer-dismiss:Hinweis schließen`;

  onDismiss(toastId: number): void {
    this.dismissedToast.emit(toastId);
  }
}
