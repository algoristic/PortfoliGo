import { Component, input, output } from '@angular/core';

import { Toast, ToastTone } from './toast.model';

const TONE_CLASSES: Record<ToastTone, string> = {
  info: 'text-accent',
  success: 'text-up',
  warning: 'text-warning',
  error: 'text-down',
};

const TONE_ICONS: Record<ToastTone, string> = {
  info: 'bi-info-circle',
  success: 'bi-check-circle',
  warning: 'bi-exclamation-triangle',
  error: 'bi-x-octagon',
};

@Component({
  selector: 'app-toast-container',
  imports: [],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
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
