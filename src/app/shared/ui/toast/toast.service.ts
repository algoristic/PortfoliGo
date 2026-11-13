import { createGlobalPositionStrategy, createOverlayRef, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ComponentRef, DestroyRef, inject, Injectable, Injector, signal } from '@angular/core';

import { ToastContainerComponent } from './toast-container.component';
import {
  DEFAULT_TOAST_DURATION_MS,
  MAX_VISIBLE_TOASTS,
  Toast,
  ToastOptions,
  ToastTone,
} from './toast.model';

/**
 * Shows short messages in an overlay above all content, including dialogs. Part of the own UI
 * library in `shared/ui`; effects use it for user feedback (`CLAUDE.md` §6).
 */
@Injectable()
export class ToastService {
  readonly #injector = inject(Injector);
  readonly #toasts = signal<Toast[]>([]);
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();
  #nextId = 1;
  #overlayRef?: OverlayRef;
  #containerRef?: ComponentRef<ToastContainerComponent>;

  toasts = this.#toasts.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#timers.forEach((timer) => clearTimeout(timer));
      this.#overlayRef?.dispose();
    });
  }

  info(message: string, options?: ToastOptions): number {
    return this.show('info', message, options);
  }

  success(message: string, options?: ToastOptions): number {
    return this.show('success', message, options);
  }

  warning(message: string, options?: ToastOptions): number {
    return this.show('warning', message, options);
  }

  error(message: string, options?: ToastOptions): number {
    return this.show('error', message, options);
  }

  show(tone: ToastTone, message: string, options: ToastOptions = {}): number {
    const toast: Toast = { id: this.#nextId++, tone, message };
    const visible = [...this.#toasts(), toast];
    visible.slice(0, -MAX_VISIBLE_TOASTS).forEach((dropped) => this.#clearTimer(dropped.id));
    this.#setToasts(visible.slice(-MAX_VISIBLE_TOASTS));

    const durationMs = options.durationMs ?? DEFAULT_TOAST_DURATION_MS[tone];
    if (durationMs > 0) {
      this.#timers.set(
        toast.id,
        setTimeout(() => this.dismiss(toast.id), durationMs),
      );
    }
    return toast.id;
  }

  dismiss(toastId: number): void {
    this.#clearTimer(toastId);
    this.#setToasts(this.#toasts().filter((toast) => toast.id !== toastId));
  }

  #setToasts(toasts: Toast[]): void {
    this.#toasts.set(toasts);
    this.#attachContainer().setInput('toasts', toasts);
  }

  #clearTimer(toastId: number): void {
    clearTimeout(this.#timers.get(toastId));
    this.#timers.delete(toastId);
  }

  #attachContainer(): ComponentRef<ToastContainerComponent> {
    if (!this.#containerRef) {
      this.#overlayRef = createOverlayRef(this.#injector, {
        // Top centre: at the bottom, toasts would cover the mobile navigation. The size is set
        // here because the unlayered CDK pane styles win over Tailwind utilities; without toasts
        // the pane has no height, so it never blocks clicks on the header below.
        positionStrategy: createGlobalPositionStrategy(this.#injector)
          .top('0')
          .centerHorizontally(),
        width: '28rem',
        maxWidth: '100%',
      });
      this.#containerRef = this.#overlayRef.attach(new ComponentPortal(ToastContainerComponent));
      this.#containerRef.instance.dismissedToast.subscribe((toastId) => this.dismiss(toastId));
    }
    return this.#containerRef;
  }
}
