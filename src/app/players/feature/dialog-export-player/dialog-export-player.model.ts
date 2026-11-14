/** An export the worker built (TS §10.2); the dialog saves it. */
export interface ExportPlayerDialogData {
  fileName: string;
  content: string;
}

export const EXPORT_SAVE_TARGETS = ['file', 'clipboard'] as const;
export type ExportSaveTarget = (typeof EXPORT_SAVE_TARGETS)[number];

/** Where the export was saved; `undefined` when the dialog was closed without saving. */
export type ExportPlayerDialogResult = ExportSaveTarget;

/** Media type of the download: Safari would append `.txt` to a `text/plain` file. */
export const EXPORT_FILE_TYPE = 'application/octet-stream';
