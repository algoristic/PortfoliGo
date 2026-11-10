export interface ConfirmDialogData {
  heading: string;
  message: string;
  confirmLabel?: string;
  declineLabel?: string;
  /** `danger` for irreversible actions such as deleting a player. */
  tone?: 'default' | 'danger';
}

/** `true` when confirmed; declining, Escape and the backdrop all yield `false`. */
export type ConfirmDialogResult = boolean;
