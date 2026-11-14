import { DOCUMENT, inject, InjectionToken } from '@angular/core';

/** Saves a text as a file of the browser's downloads (platform port, e.g. an export, TS §10.2). */
export interface FileDownloadPort {
  save(fileName: string, content: string, type: string): void;
}

/** How long the object URL of a download stays valid; Safari reads it after the click returns. */
const REVOKE_AFTER_MS = 10_000;

/**
 * Downloads through a temporary link with a `Blob` URL. A root default, so page tests replace it
 * at the root injector (`RecordingFileDownload` in `../testing`).
 */
export const FILE_DOWNLOAD = new InjectionToken<FileDownloadPort>('FILE_DOWNLOAD', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return {
      save: (fileName, content, type) => {
        const url = URL.createObjectURL(new Blob([content], { type }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.rel = 'noopener';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
      },
    };
  },
});
