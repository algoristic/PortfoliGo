export const TOAST_TONES = ['info', 'success', 'warning', 'error'] as const;
export type ToastTone = (typeof TOAST_TONES)[number];

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface ToastOptions {
  /** `0` keeps the toast until it is dismissed. */
  durationMs?: number;
}

export const MAX_VISIBLE_TOASTS = 3;

export const DEFAULT_TOAST_DURATION_MS: Record<ToastTone, number> = {
  info: 5000,
  success: 5000,
  warning: 8000,
  error: 8000,
};
