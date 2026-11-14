import { Provider } from '@angular/core';

import { FILE_DOWNLOAD, FileDownloadPort } from '../file-download/file-download';

export interface DownloadedFile {
  fileName: string;
  content: string;
  type: string;
}

/** Keeps every download instead of saving it; provide it with `provideRecordingFileDownload`. */
export class RecordingFileDownload implements FileDownloadPort {
  readonly files: DownloadedFile[] = [];

  save(fileName: string, content: string, type: string): void {
    this.files.push({ fileName, content, type });
  }
}

/** Replaces the download port at the root injector (page tests). */
export function provideRecordingFileDownload(downloads: RecordingFileDownload): Provider {
  return { provide: FILE_DOWNLOAD, useValue: downloads };
}
