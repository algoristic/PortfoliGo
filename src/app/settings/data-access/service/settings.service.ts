import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { LocalStorageService } from '@app/persistence/data-access/local-storage/local-storage.service';
import { Settings } from '@app/settings/domain/models/settings.model';
import { parseSettings } from '@app/settings/domain/settings-logic';

import { SETTINGS_VERSION } from './settings-service.model';

/** Settings of this device in `pgo.settings` (TS §9.3). */
@Injectable()
export class SettingsService {
  readonly #localStorage = inject(LocalStorageService);

  /** The stored settings; missing, invalid or other versions of entries give the defaults. */
  load(): Observable<Settings> {
    return this.#localStorage
      .get<unknown>('pgo.settings', SETTINGS_VERSION)
      .pipe(map((data) => parseSettings(data)));
  }

  save(settings: Settings): Observable<Settings> {
    return this.#localStorage.set('pgo.settings', SETTINGS_VERSION, settings);
  }
}
