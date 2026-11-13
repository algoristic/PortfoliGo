import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import type { Mocked } from 'vitest';

import { emptyMonthlyValues } from '@app/banking/domain/monthly-values-logic';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';

import { AbsenceReportEffects } from './absence-report.effects';
import * as NotificationsActions from './notifications.actions';
import {
  selectAccountNames,
  selectPendingReport,
  selectReportToShow,
} from './notifications.selectors';

import { DialogAbsenceReportComponent } from '../dialog-absence-report/dialog-absence-report.component';

const NAMES = new Map([['acc-1', 'Girokonto 0000000001 · Hansebank']]);

function report(from: number, to: number): AbsenceReport {
  return {
    from,
    to,
    netWorthBefore: 0,
    netWorthAfter: 0,
    flows: emptyMonthlyValues(),
    bookings: 1,
    notifications: 0,
    warnings: [],
    warningCount: 0,
    indices: [],
  };
}

describe('AbsenceReportEffects', () => {
  let effects: AbsenceReportEffects;
  let actions$: Subject<Action>;
  let dialog: Mocked<Pick<Dialog, 'open'>>;
  let closed: Subject<void>;
  let close: ReturnType<typeof vi.fn>;
  let store: MockStore;
  let received: Action[];

  function show(pending: AbsenceReport | null, toShow = pending): void {
    store.overrideSelector(selectPendingReport, pending);
    store.overrideSelector(selectReportToShow, toShow);
    store.refreshState();
  }

  beforeEach(() => {
    actions$ = new Subject();
    closed = new Subject();
    close = vi.fn(() => {
      closed.next();
      closed.complete();
    });
    dialog = {
      open: vi.fn(
        () => ({ closed: closed.asObservable(), close }) as unknown as ReturnType<Dialog['open']>,
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        AbsenceReportEffects,
        provideMockActions(() => actions$.asObservable()),
        { provide: Dialog, useValue: dialog },
        provideMockStore({
          selectors: [
            { selector: selectAccountNames, value: NAMES },
            { selector: selectPendingReport, value: null },
            { selector: selectReportToShow, value: null },
          ],
        }),
      ],
    });
    effects = TestBed.inject(AbsenceReportEffects);
    store = TestBed.inject(MockStore);
    received = [];
  });

  it('opens the dialog of a report once the game is ready and reports its closing', () => {
    const subscription = effects.openAbsenceReport$.subscribe((action) => received.push(action));
    const first = report(10, 20);
    // Catching up: the overlay covers the game, the report waits (TS §11.10).
    show(first, null);
    expect(dialog.open).not.toHaveBeenCalled();

    show(first);
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open.mock.calls[0]?.[0]).toBe(DialogAbsenceReportComponent);
    expect(dialog.open.mock.calls[0]?.[1]?.data).toEqual({ report: first, accountNames: NAMES });

    closed.next();
    closed.complete();
    subscription.unsubscribe();
    expect(received).toEqual([NotificationsActions.closedAbsenceReport({ from: 10, to: 20 })]);
  });

  it('opens no second dialog when the same report shows again while its dialog is open', () => {
    const subscription = effects.openAbsenceReport$.subscribe((action) => received.push(action));
    const first = report(10, 20);
    show(first);
    // A worker restart covers the game for a moment, then the same report shows again.
    show(first, null);
    show(first);
    expect(dialog.open).toHaveBeenCalledTimes(1);

    // Closing it clears the report in the slice before the next dialog in line may open.
    show(null);
    closed.next();
    closed.complete();
    subscription.unsubscribe();
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });

  it('closes the dialog when the game is left', () => {
    const subscription = effects.openAbsenceReport$.subscribe((action) => received.push(action));
    show(report(10, 20));
    actions$.next(SessionActions.leaveGame());
    subscription.unsubscribe();
    expect(close).toHaveBeenCalled();
  });
});
