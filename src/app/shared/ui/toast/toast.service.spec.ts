import { TestBed } from '@angular/core/testing';

import { MAX_VISIBLE_TOASTS } from './toast.model';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [ToastService] });
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function renderedMessages(): string[] {
    return Array.from(document.querySelectorAll('app-toast-container li p')).map(
      (element) => element.textContent?.trim() ?? '',
    );
  }

  describe('show', () => {
    it('adds toasts with increasing ids', () => {
      const first = service.success('Gespeichert');
      const second = service.error('Fehlgeschlagen');
      expect(second).toBeGreaterThan(first);
      expect(service.toasts()).toEqual([
        { id: first, tone: 'success', message: 'Gespeichert' },
        { id: second, tone: 'error', message: 'Fehlgeschlagen' },
      ]);
    });

    it('renders the toasts in an overlay', () => {
      service.info('Hallo');
      TestBed.tick();
      expect(renderedMessages()).toEqual(['Hallo']);
    });

    it('keeps only the newest toasts when the limit is exceeded', () => {
      const ids = Array.from({ length: MAX_VISIBLE_TOASTS + 2 }, (_, i) => service.info(`${i}`));
      expect(service.toasts().map((toast) => toast.id)).toEqual(ids.slice(-MAX_VISIBLE_TOASTS));
    });

    it('dismisses toasts after their duration', () => {
      service.info('Kurz', { durationMs: 1000 });
      vi.advanceTimersByTime(999);
      expect(service.toasts()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(service.toasts()).toHaveLength(0);
    });

    it('keeps toasts with a duration of 0 until they are dismissed', () => {
      service.warning('Bleibt', { durationMs: 0 });
      vi.advanceTimersByTime(60_000);
      expect(service.toasts()).toHaveLength(1);
    });
  });

  describe('dismiss', () => {
    it('removes the toast and its timer', () => {
      const first = service.info('Erster');
      const timersWithOneToast = vi.getTimerCount();
      const second = service.info('Weg');
      expect(vi.getTimerCount()).toBe(timersWithOneToast + 1);
      service.dismiss(second);
      expect(service.toasts().map((toast) => toast.id)).toEqual([first]);
      expect(vi.getTimerCount()).toBe(timersWithOneToast);
    });

    it('is triggered by the dismiss button', () => {
      const id = service.info('Klick');
      TestBed.tick();
      document.querySelector<HTMLButtonElement>(`[data-testid="toast.${id}.dismiss"]`)?.click();
      expect(service.toasts()).toHaveLength(0);
    });
  });
});
