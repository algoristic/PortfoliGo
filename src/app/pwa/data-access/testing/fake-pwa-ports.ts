import { Provider } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

import { AppUpdateEvent, InstallOutcome, PlatformInfo } from '@app/pwa/domain/models/pwa.model';

import {
  APP_UPDATE,
  AppUpdatePort,
  INSTALL_PROMPT,
  InstallPromptPort,
  PLATFORM_INFO,
  STORAGE_ESTIMATE,
  StorageEstimatePort,
} from '../platform/platform';

/** The installation dialog of a Chromium browser: `offer()` stands for `beforeinstallprompt`. */
export class FakeInstallPrompt implements InstallPromptPort {
  readonly #available = new BehaviorSubject(false);
  readonly #installed = new Subject<void>();
  prompts = 0;
  /** The user's answer to the next dialog. */
  outcome: InstallOutcome = 'accepted';

  available$ = this.#available.asObservable();
  installed$ = this.#installed.asObservable();

  offer(): void {
    this.#available.next(true);
  }

  async prompt(): Promise<InstallOutcome> {
    if (!this.#available.value) {
      return 'unavailable';
    }
    this.prompts++;
    this.#available.next(false);
    if (this.outcome === 'accepted') {
      this.#installed.next();
    }
    return this.outcome;
  }
}

/** `navigator.storage.estimate()` with set figures; tests may change them. */
export class FakeStorageEstimate implements StorageEstimatePort {
  usage: number | null;
  quota: number | null;

  constructor(usage: number | null = null, quota: number | null = null) {
    this.usage = usage;
    this.quota = quota;
  }

  async estimate(): Promise<{ usage: number | null; quota: number | null } | null> {
    return this.usage === null && this.quota === null
      ? null
      : { usage: this.usage, quota: this.quota };
  }
}

/** The service worker's update events; `emit()` stands for a new or broken version. */
export class FakeAppUpdate implements AppUpdatePort {
  readonly #events = new Subject<AppUpdateEvent>();
  readonly reloads: boolean[] = [];

  events$ = this.#events.asObservable();

  emit(event: AppUpdateEvent): void {
    this.#events.next(event);
  }

  async reload(activate: boolean): Promise<void> {
    this.reloads.push(activate);
  }
}

export interface PwaTestPorts {
  platform?: PlatformInfo;
  install?: FakeInstallPrompt;
  storage?: FakeStorageEstimate;
  update?: FakeAppUpdate;
}

/** Replaces the platform ports of the PWA; provide it at the root injector. */
export function providePwaTestPorts(ports: PwaTestPorts = {}): Provider[] {
  return [
    { provide: PLATFORM_INFO, useValue: ports.platform ?? { standalone: false, ios: false } },
    { provide: INSTALL_PROMPT, useValue: ports.install ?? new FakeInstallPrompt() },
    { provide: STORAGE_ESTIMATE, useValue: ports.storage ?? new FakeStorageEstimate() },
    { provide: APP_UPDATE, useValue: ports.update ?? new FakeAppUpdate() },
  ];
}
