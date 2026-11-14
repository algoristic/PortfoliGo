import { Dialog } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { Action, select, Store } from '@ngrx/store';
import { exhaustMap, filter, fromEvent, map, switchMap, takeUntil, tap } from 'rxjs';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import { selectAccountOverview } from '@app/banking/feature/state/banking.selectors';
import * as ClockActions from '@app/clock/feature/state/clock.actions';
import { CLOCK_SHORTCUTS_ENABLED } from '@app/clock/feature/state/clock.config';
import * as ClockSelectors from '@app/clock/feature/state/clock.selectors';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import * as SessionSelectors from '@app/engine/feature/state/session.selectors';
import { selectInstruments } from '@app/market/feature/state/market.selectors';
import * as PlayersActions from '@app/players/feature/state/players.actions';
import { isCommandPaletteShortcut } from '@app/shell/domain/command-palette-logic';
import { PaletteCommand } from '@app/shell/domain/models/command.model';
import * as TradingActions from '@app/trading/feature/state/trading.actions';

import { commandPaletteData } from './command-palette.utils';
import * as ShellActions from './shell.actions';

import { DialogCommandPaletteComponent } from '../dialog-command-palette/dialog-command-palette.component';
import {
  CommandPaletteDialogData,
  CommandPaletteDialogResult,
} from '../dialog-command-palette/dialog-command-palette.model';

@Injectable()
export class ShellEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #dialog = inject(Dialog);
  readonly #overlay = inject(Overlay);
  readonly #router = inject(Router);
  readonly #document = inject(DOCUMENT);
  readonly #shortcutsEnabled$ = inject(CLOCK_SHORTCUTS_ENABLED);

  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  /**
   * `Strg`/`⌘`+`K` while the game is ready (PS US-UI-05, TS §11.10): also in a text field, not
   * while another dialog is open and not when the shortcuts are switched off in the settings.
   */
  shortcut$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.loadPlayerSuccess),
      switchMap(() =>
        fromEvent<KeyboardEvent>(this.#document, 'keydown').pipe(takeUntil(this.#ended$)),
      ),
      filter((event) => !event.defaultPrevented && isCommandPaletteShortcut(event)),
      concatLatestFrom(() => [
        this.#shortcutsEnabled$,
        this.#store.pipe(select(SessionSelectors.selectStatus)),
      ]),
      filter(
        ([, enabled, status]) =>
          enabled && status === 'ready' && this.#dialog.openDialogs.length === 0,
      ),
      // The browser would focus its own search field.
      tap(([event]) => event.preventDefault()),
      map(() => ShellActions.pressedCommandPaletteShortcut()),
    ),
  );

  openCommandPalette$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(ShellActions.clickedCommandPalette, ShellActions.pressedCommandPaletteShortcut),
      concatLatestFrom(() => [
        this.#store.pipe(select(ClockSelectors.selectPaused)),
        this.#store.pipe(select(ClockSelectors.selectSpeed)),
        this.#store.pipe(select(ClockSelectors.selectJumping)),
        this.#store.pipe(select(selectAccountOverview)),
        this.#store.pipe(select(selectInstruments)),
      ]),
      exhaustMap(([, paused, speed, jumping, accounts, instruments]) =>
        this.#dialog
          .open<CommandPaletteDialogResult, CommandPaletteDialogData>(
            DialogCommandPaletteComponent,
            {
              data: commandPaletteData({
                paused,
                speed,
                jumping,
                openAccountCount: accounts.open.length,
                instruments,
              }),
              ariaLabel: $localize`:@@featureShell-shellEffects-commandPaletteLabel:Befehlspalette`,
              autoFocus: '[data-testid="shell.command-palette.input"]',
              width: '36rem',
              maxWidth: 'calc(100vw - 2rem)',
              positionStrategy: this.#overlay.position().global().centerHorizontally().top('10vh'),
            },
          )
          .closed.pipe(
            filter((command): command is PaletteCommand => command !== undefined),
            map((command) => ShellActions.selectedPaletteCommand({ command })),
          ),
      ),
    ),
  );

  /** Actions run through the slices they belong to, so they behave like their buttons. */
  runCommand$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(ShellActions.selectedPaletteCommand),
      map(({ command }) => commandAction(command)),
      filter((action): action is Action => action !== null),
    ),
  );

  navigate$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(ShellActions.selectedPaletteCommand),
        concatLatestFrom(() => this.#store.pipe(select(SessionSelectors.selectPlayerId))),
        tap(([{ command }, playerId]) => {
          if (command.kind === 'switch-player') {
            void this.#router.navigate(['/players']);
          } else if (playerId !== null && command.kind === 'navigate') {
            void this.#router.navigate(['/game', playerId, ...command.page.split('/')]);
          } else if (playerId !== null && command.kind === 'instrument') {
            void this.#router.navigate(['/game', playerId, 'markets', command.instrumentId]);
          }
        }),
      ),
    { dispatch: false },
  );
}

function commandAction(command: PaletteCommand): Action | null {
  switch (command.kind) {
    case 'toggle-pause':
      return ClockActions.clickedTogglePause();
    case 'speed':
      return ClockActions.selectedSpeed({ speed: command.speed });
    case 'jump':
      return ClockActions.clickedJump();
    case 'transfer':
      return BankingActions.clickedTransfer({});
    case 'open-account':
      return BankingActions.clickedOpenAccount({});
    case 'buy':
      return TradingActions.clickedBuy({ instrumentId: command.instrumentId });
    case 'export':
      return PlayersActions.clickedExportPlayer();
    case 'navigate':
    case 'instrument':
    case 'switch-player':
      return null;
  }
}
