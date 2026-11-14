/** The export to import (file content or pasted text); `undefined` when the dialog was closed. */
export type ImportPlayerDialogResult = string;

export interface ImportPlayerFormModel {
  text: string;
}

/** A chosen export file, read as text. */
export interface ImportFile {
  name: string;
  content: string;
}
