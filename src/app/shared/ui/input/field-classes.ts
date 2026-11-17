import { FieldBackground } from './input.model';

// Shared by `appInput` and `appSelect`; width, text size and alignment stay with the caller.
export const FIELD_BASE_CLASSES =
  'rounded-md border border-border text-fg aria-invalid:border-down';

export const FIELD_BACKGROUND_CLASSES: Record<FieldBackground, string> = {
  surface: 'bg-surface',
  bg: 'bg-bg',
};
