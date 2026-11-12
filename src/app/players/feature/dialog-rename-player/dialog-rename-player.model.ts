export interface RenamePlayerDialogData {
  name: string;
}

/** The new name as entered; `undefined` when the dialog was closed without saving. */
export type RenamePlayerDialogResult = string;

export interface RenamePlayerFormModel {
  name: string;
}
