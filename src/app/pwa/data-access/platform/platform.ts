import { DOCUMENT, inject, InjectionToken } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import {
  BehaviorSubject,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  merge,
  Observable,
  Subject,
} from 'rxjs';

import { AppUpdateEvent, InstallOutcome, PlatformInfo } from '@app/pwa/domain/models/pwa.model';
import { isIosDevice } from '@app/pwa/domain/pwa-logic';

// Platform ports of the PWA (TS §13, E-05). Each has a root default with the browser APIs, so page
// tests replace them at the root injector (`providePwaTestPorts()` in `../testing`).

/** The platform, read once at the start. */
export const PLATFORM_INFO = new InjectionToken<PlatformInfo>('PLATFORM_INFO', {
  providedIn: 'root',
  factory: () => {
    const window = inject(DOCUMENT).defaultView;
    if (window === null) {
      return { standalone: false, ios: false };
    }
    const navigator = window.navigator as Navigator & { standalone?: boolean };
    return {
      standalone:
        window.matchMedia?.('(display-mode: standalone)').matches === true ||
        navigator.standalone === true,
      ios: isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    };
  },
});

/** The browser's installation dialog (US-UI-07). */
export interface InstallPromptPort {
  /** Whether the browser offers the dialog now; changes when it is caught or used. */
  available$: Observable<boolean>;
  /** The app was installed (`appinstalled`). */
  installed$: Observable<void>;
  /** Shows the dialog; it can be used once, so it is gone afterwards. */
  prompt(): Promise<InstallOutcome>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Keeps the last `beforeinstallprompt` (Chromium browsers) for the button in the settings. It does
 * not call `preventDefault()`, so the browser's own hint stays. Created with the PWA effects at
 * the start, before the browser fires the event.
 */
export class WebInstallPrompt implements InstallPromptPort {
  readonly #event = new BehaviorSubject<BeforeInstallPromptEvent | null>(null);
  readonly #installed = new Subject<void>();

  available$ = this.#event.pipe(
    map((event) => event !== null),
    distinctUntilChanged(),
  );
  installed$ = this.#installed.asObservable();

  constructor(window: Window | null) {
    window?.addEventListener('beforeinstallprompt', (event) =>
      this.#event.next(event as BeforeInstallPromptEvent),
    );
    window?.addEventListener('appinstalled', () => {
      this.#event.next(null);
      this.#installed.next();
    });
  }

  async prompt(): Promise<InstallOutcome> {
    const event = this.#event.value;
    if (event === null) {
      return 'unavailable';
    }
    this.#event.next(null);
    await event.prompt();
    return (await event.userChoice).outcome;
  }
}

export const INSTALL_PROMPT = new InjectionToken<InstallPromptPort>('INSTALL_PROMPT', {
  providedIn: 'root',
  factory: () => new WebInstallPrompt(inject(DOCUMENT).defaultView),
});

/** `navigator.storage.estimate()` (US-EX-03, TS §9.5); `null` where the browser has none. */
export interface StorageEstimatePort {
  estimate(): Promise<{ usage: number | null; quota: number | null } | null>;
}

export const STORAGE_ESTIMATE = new InjectionToken<StorageEstimatePort>('STORAGE_ESTIMATE', {
  providedIn: 'root',
  factory: () => {
    const storage = inject(DOCUMENT).defaultView?.navigator.storage;
    return {
      estimate: async () => {
        if (storage?.estimate === undefined) {
          return null;
        }
        const { usage, quota } = await storage.estimate();
        return { usage: usage ?? null, quota: quota ?? null };
      },
    };
  },
});

/** New versions of the app through the service worker (US-UI-07, TS §13, §15). */
export interface AppUpdatePort {
  events$: Observable<AppUpdateEvent>;
  /** Reloads the page; with `activate` the loaded new version first. */
  reload(activate: boolean): Promise<void>;
}

/**
 * Over `SwUpdate`, which only the bootstrap provides (`provideServiceWorker` in `app.config.ts`);
 * without it, or with the worker off (development, tests), no events come.
 */
export class SwAppUpdate implements AppUpdatePort {
  readonly #swUpdate: SwUpdate | null;
  readonly #document: Document;

  events$: Observable<AppUpdateEvent>;

  constructor(swUpdate: SwUpdate | null, document: Document) {
    this.#swUpdate = swUpdate;
    this.#document = document;
    this.events$ =
      swUpdate?.isEnabled === true
        ? merge(
            swUpdate.versionUpdates.pipe(
              filter((event) => event.type === 'VERSION_READY'),
              map((): AppUpdateEvent => 'version-ready'),
            ),
            swUpdate.unrecoverable.pipe(map((): AppUpdateEvent => 'unrecoverable')),
          )
        : EMPTY;
  }

  async reload(activate: boolean): Promise<void> {
    if (activate && this.#swUpdate?.isEnabled === true) {
      // A failed activation still reloads: the next start activates the version anyway.
      await this.#swUpdate.activateUpdate().catch(() => false);
    }
    this.#document.location.reload();
  }
}

export const APP_UPDATE = new InjectionToken<AppUpdatePort>('APP_UPDATE', {
  providedIn: 'root',
  factory: () => new SwAppUpdate(inject(SwUpdate, { optional: true }), inject(DOCUMENT)),
});
