import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { Action, select, Store } from '@ngrx/store';
import {
  concatMap,
  defer,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  Observable,
  switchMap,
  take,
  takeUntil,
} from 'rxjs';

import * as SessionActions from '@app/engine/feature/state/session.actions';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';

import * as NotificationsActions from './notifications.actions';
import {
  selectAccountNames,
  selectInstrumentNames,
  selectPendingReport,
  selectReportToShow,
} from './notifications.selectors';

import { DialogAbsenceReportComponent } from '../dialog-absence-report/dialog-absence-report.component';
import { AbsenceReportDialogData } from '../dialog-absence-report/dialog-absence-report.model';

/**
 * The dialog of the absence report (US-BN-03): it opens once the game is ready, never above the
 * overlay of loading or catching up, and one report after the other. Leaving the game closes it.
 */
@Injectable()
export class AbsenceReportEffects {
  readonly #actions$ = inject(Actions);
  readonly #dialog = inject(Dialog);
  readonly #store = inject(Store);

  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  openAbsenceReport$ = createEffect(() =>
    this.#store.pipe(
      select(selectReportToShow),
      distinctUntilChanged(),
      filter((report): report is AbsenceReport => report !== null),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectAccountNames)),
        this.#store.pipe(select(selectInstrumentNames)),
      ]),
      concatMap(([report, accountNames, instrumentNames]) =>
        this.#store.pipe(
          select(selectPendingReport),
          take(1),
          // A report shown or replaced while waiting for an earlier dialog opens no second one.
          filter((pending) => pending === report),
          switchMap(() => this.#openDialog(report, { accountNames, instrumentNames })),
        ),
      ),
    ),
  );

  #openDialog(
    report: AbsenceReport,
    names: Pick<AbsenceReportDialogData, 'accountNames' | 'instrumentNames'>,
  ): Observable<Action> {
    return defer(() => {
      const dialogRef = this.#dialog.open<void, AbsenceReportDialogData>(
        DialogAbsenceReportComponent,
        {
          data: { report, ...names },
          ariaLabel: $localize`:@@featureNotifications-absenceReportEffects-dialogLabel:Abwesenheitsbericht`,
          // A report to read: the screen reader starts at its title, not at a button.
          autoFocus: 'dialog',
          width: '36rem',
          maxWidth: 'calc(100vw - 2rem)',
          maxHeight: 'calc(100dvh - 2rem)',
        },
      );
      return dialogRef.closed.pipe(
        map(() => NotificationsActions.closedAbsenceReport({ from: report.from, to: report.to })),
        takeUntil(this.#ended$),
        finalize(() => dialogRef.close()),
      );
    });
  }
}
