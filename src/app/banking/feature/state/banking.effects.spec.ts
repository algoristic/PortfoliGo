import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, take, throwError, toArray } from 'rxjs';
import type { Mocked } from 'vitest';

import { BANK_COMMAND_ERRORS } from '@app/banking/domain/models/bank-command.model';
import { StatementEntry } from '@app/banking/domain/models/statement.model';
import { selectTick } from '@app/clock/feature/state/clock.selectors';
import {
  EngineQueryResultOf,
  ProjectionPayload,
} from '@app/engine/data-access/service/engine-service.model';
import { EngineCommandError, EngineService } from '@app/engine/data-access/service/engine.service';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectPhase } from '@app/engine/feature/state/session.selectors';
import { PlayerProfile } from '@app/players/domain/models/player.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';
import { Bank } from '@app/world/domain/models/bank.model';

import { bankCommandFailureMessage } from './banking-errors.utils';
import * as BankingActions from './banking.actions';
import {
  BankingEffects,
  MONTHLY_VALUES_THROTTLE_MS,
  STATEMENT_SEARCH_DEBOUNCE_MS,
} from './banking.effects';
import { BANK_COMMANDS, StatementState } from './banking.model';
import { selectNetWorth, selectStatement, selectStatementAccountId } from './banking.selectors';
import { initialStatementState } from './banking.utils';

function projection(tick: number, full: boolean, netWorth: number): ProjectionPayload {
  return { tick, full, accounts: [], netWorth };
}

const TRANSFER = {
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 123_456,
  purpose: 'Miete',
} as const;

describe('BankingEffects', () => {
  let effects: BankingEffects;
  let actions$: Subject<Action>;
  let projection$: Subject<ProjectionPayload>;
  let engine: Mocked<
    Pick<
      EngineService,
      | 'banks'
      | 'openAccount'
      | 'closeAccount'
      | 'setSalaryAccount'
      | 'transfer'
      | 'statement'
      | 'monthlyValues'
      | 'projection$'
    >
  >;
  let toasts: Mocked<Pick<ToastService, 'success' | 'error'>>;
  let store: MockStore;

  beforeEach(() => {
    actions$ = new Subject();
    projection$ = new Subject();
    engine = {
      banks: vi.fn(),
      openAccount: vi.fn(),
      closeAccount: vi.fn(),
      setSalaryAccount: vi.fn(),
      transfer: vi.fn(),
      statement: vi.fn(),
      monthlyValues: vi.fn(),
      projection$: projection$.asObservable(),
    };
    toasts = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        BankingEffects,
        provideMockActions(() => actions$.asObservable()),
        { provide: EngineService, useValue: engine },
        { provide: ToastService, useValue: toasts },
        provideMockStore(),
      ],
    });
    effects = TestBed.inject(BankingEffects);
    store = TestBed.inject(MockStore);
  });

  describe('watchProjection$', () => {
    it('takes the last full projection before the reply to loadPlayer and every one after it', async () => {
      const profile = { id: 'p-b' } as PlayerProfile;
      const result = firstValueFrom(effects.watchProjection$.pipe(take(3), toArray()));
      actions$.next(SessionActions.enterGame({ profile }));
      projection$.next(projection(1, false, 100));
      projection$.next(projection(2, true, 200));
      projection$.next(projection(3, true, 300));
      projection$.next(projection(4, false, 400));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-b', tick: 4 } }));
      projection$.next(projection(5, false, 500));
      projection$.next(projection(6, true, 600));
      expect(await result).toEqual([
        BankingActions.receivedProjection({ projection: projection(3, true, 300) }),
        BankingActions.receivedProjection({ projection: projection(5, false, 500) }),
        BankingActions.receivedProjection({ projection: projection(6, true, 600) }),
      ]);
    });

    it('drops the projections after the game was left', () => {
      const received: Action[] = [];
      const subscription = effects.watchProjection$.subscribe((action) => received.push(action));
      actions$.next(SessionActions.enterGame({ profile: { id: 'p-a' } as PlayerProfile }));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 1 } }));
      projection$.next(projection(1, false, 100));
      actions$.next(SessionActions.leaveGame());
      projection$.next(projection(2, false, 200));
      subscription.unsubscribe();
      expect(received).toEqual([
        BankingActions.receivedProjection({ projection: projection(1, false, 100) }),
      ]);
    });
  });

  describe('loadBanks$', () => {
    const loaded = SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 1 } });

    it('loads the banks once the player is loaded', async () => {
      const banks = [{ id: 'bank-1', name: 'Hausbank' } as Bank];
      engine.banks.mockReturnValue(of({ kind: 'banks' as const, banks }));
      const result = firstValueFrom(effects.loadBanks$);
      actions$.next(loaded);
      expect(await result).toEqual(BankingActions.retrievedBanks({ banks }));
    });

    it('dispatches loadBanksFailure when the query fails', async () => {
      const error = new EngineCommandError('player-not-loaded');
      engine.banks.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.loadBanks$);
      actions$.next(loaded);
      expect(await result).toEqual(BankingActions.loadBanksFailure({ error }));
    });
  });

  describe('commands', () => {
    it('opens an account and passes the new account on', async () => {
      engine.openAccount.mockReturnValue(of({ tick: 7, accountId: 'acc-3', depotId: 'dep-4' }));
      const result = firstValueFrom(effects.openAccount$);
      actions$.next(BankingActions.submittedOpenAccount({ bankId: 'bank-2', kind: 'depot' }));
      expect(await result).toEqual(
        BankingActions.openAccountSuccess({
          bankId: 'bank-2',
          kind: 'depot',
          accountId: 'acc-3',
          depotId: 'dep-4',
          tick: 7,
        }),
      );
      expect(engine.openAccount).toHaveBeenCalledWith('bank-2', 'depot');
    });

    it('closes an account with or without a target for the remainder', async () => {
      engine.closeAccount.mockReturnValue(of({ tick: 9 }));
      const results = firstValueFrom(effects.closeAccount$.pipe(take(2), toArray()));
      actions$.next(BankingActions.submittedCloseAccount({ accountId: 'acc-2' }));
      actions$.next(
        BankingActions.submittedCloseAccount({ accountId: 'acc-3', targetAccountId: 'acc-1' }),
      );
      expect(await results).toEqual([
        BankingActions.closeAccountSuccess({ accountId: 'acc-2', tick: 9 }),
        BankingActions.closeAccountSuccess({
          accountId: 'acc-3',
          targetAccountId: 'acc-1',
          tick: 9,
        }),
      ]);
      expect(engine.closeAccount.mock.calls).toEqual([
        ['acc-2', undefined],
        ['acc-3', 'acc-1'],
      ]);
    });

    it('dispatches the failure with the error of the engine', async () => {
      const error = new EngineCommandError('insufficient-funds');
      engine.transfer.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.transfer$);
      actions$.next(BankingActions.submittedTransfer({ transfer: TRANSFER }));
      expect(await result).toEqual(BankingActions.transferFailure({ error }));
    });

    it('goes on after a failure', async () => {
      engine.setSalaryAccount
        .mockReturnValueOnce(throwError(() => new EngineCommandError('not-a-current-account')))
        .mockReturnValueOnce(of({ tick: 3 }));
      const results = firstValueFrom(effects.setSalaryAccount$.pipe(take(2), toArray()));
      actions$.next(BankingActions.submittedSalaryAccount({ accountId: 'acc-2' }));
      actions$.next(BankingActions.submittedSalaryAccount({ accountId: 'acc-1' }));
      expect((await results)[1]).toEqual(
        BankingActions.setSalaryAccountSuccess({ accountId: 'acc-1', tick: 3 }),
      );
    });
  });

  describe('showSuccess$', () => {
    it.each([
      [
        BankingActions.openAccountSuccess({
          bankId: 'bank-1',
          kind: 'savings',
          accountId: 'acc-2',
          depotId: null,
          tick: 1,
        }),
        'Das Tagesgeldkonto ist eröffnet.',
      ],
      [
        BankingActions.closeAccountSuccess({ accountId: 'acc-2', tick: 1 }),
        'Das Konto ist geschlossen.',
      ],
      [BankingActions.transferSuccess({ transfer: TRANSFER, tick: 1 }), '1.234,56 € überwiesen.'],
    ])('shows a toast for %s', (action, text) => {
      const subscription = effects.showSuccess$.subscribe();
      actions$.next(action);
      subscription.unsubscribe();
      // `Intl` separates amount and currency with a no-break space.
      expect(toasts.success.mock.calls[0]?.[0].replace(/\s/g, ' ')).toBe(text);
    });
  });

  describe('showFailure$', () => {
    it.each([
      [
        BankingActions.transferFailure({ error: new EngineCommandError('insufficient-funds') }),
        'Der Betrag ist höher als das, was auf dem Konto verfügbar ist.',
      ],
      [
        BankingActions.closeAccountFailure({ error: new EngineCommandError('salary-account') }),
        'Das Gehaltskonto lässt sich erst schließen, wenn du ein anderes Girokonto als Gehaltskonto gewählt hast.',
      ],
      [
        BankingActions.transferFailure({ error: new EngineCommandError('purpose-too-long') }),
        'Der Verwendungszweck darf höchstens 140 Zeichen lang sein.',
      ],
      [
        BankingActions.openAccountFailure({ error: new EngineCommandError('busy') }),
        'Das geht gerade nicht, weil die Spielzeit noch berechnet wird.',
      ],
      [
        BankingActions.setSalaryAccountFailure({ error: new EngineCommandError('storage-failed') }),
        'Der Auftrag konnte nicht gespeichert werden und wurde nicht ausgeführt.',
      ],
      [
        BankingActions.openAccountFailure({ error: new EngineCommandError('worker-failed') }),
        'Das Konto konnte nicht eröffnet werden.',
      ],
      [
        BankingActions.transferFailure({ error: new Error('unexpected') }),
        'Die Überweisung konnte nicht ausgeführt werden.',
      ],
    ])('shows the text for %s', (action, text) => {
      const subscription = effects.showFailure$.subscribe();
      actions$.next(action);
      subscription.unsubscribe();
      expect(toasts.error).toHaveBeenCalledWith(text);
    });

    it('has its own text for every error code of the bank commands', () => {
      const fallbacks = BANK_COMMANDS.map((command) =>
        bankCommandFailureMessage(command, new EngineCommandError('internal-error')),
      );
      const texts = BANK_COMMAND_ERRORS.map((code) =>
        bankCommandFailureMessage('transfer', new EngineCommandError(code)),
      );
      expect(new Set(texts).size).toBe(BANK_COMMAND_ERRORS.length);
      expect(texts.filter((text) => fallbacks.includes(text))).toEqual([]);
    });
  });

  describe('loadStatement$', () => {
    const MS_PER_MINUTE = 60_000;
    /** Tick of a game time in UTC (TS §3.2), independent of the calendar functions. */
    const tickAt = (month: number, day: number, hour = 0): number =>
      (Date.UTC(2030, month - 1, day, hour) - Date.UTC(2020, 0, 1)) / MS_PER_MINUTE;
    const entry = { seq: 1 } as StatementEntry;
    let loads: Action[];
    let subscription: { unsubscribe(): void };

    function statement(changes: Partial<StatementState> = {}): StatementState {
      return { ...initialStatementState, generation: 3, loading: true, ...changes };
    }

    function setState(changes: Partial<StatementState>): void {
      store.overrideSelector(selectStatement, statement(changes));
      store.refreshState();
    }

    beforeEach(() => {
      store.overrideSelector(selectPhase, 'loaded');
      store.overrideSelector(selectStatementAccountId, 'acc-1');
      store.overrideSelector(selectTick, tickAt(5, 15, 10));
      store.overrideSelector(selectStatement, statement());
      engine.statement.mockReturnValue(
        of({ kind: 'statement', total: 120, entries: [entry], tick: 1 }),
      );
      loads = [];
      subscription = effects.loadStatement$.subscribe((action) => loads.push(action));
    });

    afterEach(() => {
      subscription.unsubscribe();
      vi.useRealTimers();
    });

    it('loads the first page once the player is loaded', () => {
      store.overrideSelector(selectPhase, 'loading');
      store.refreshState();
      actions$.next(BankingActions.enterAccountStatementPage());
      expect(engine.statement).not.toHaveBeenCalled();
      store.overrideSelector(selectPhase, 'loaded');
      store.refreshState();
      expect(engine.statement).toHaveBeenCalledWith({ accountId: 'acc-1', offset: 0, limit: 50 });
      expect(loads).toEqual([
        BankingActions.retrievedStatementPage({
          generation: 3,
          offset: 0,
          total: 120,
          entries: [entry],
        }),
      ]);
    });

    it('queries the period as ticks of the game time, the types and the trimmed search', () => {
      actions$.next(BankingActions.enterAccountStatementPage());
      setState({
        generation: 4,
        filter: { period: 'last-month', types: ['transfer'], search: '  Urlaub ' },
      });
      actions$.next(BankingActions.selectedStatementPeriod({ period: 'last-month' }));
      expect(engine.statement).toHaveBeenLastCalledWith({
        accountId: 'acc-1',
        offset: 0,
        limit: 50,
        from: tickAt(4, 1),
        to: tickAt(5, 1) - 1,
        types: ['transfer'],
        search: 'Urlaub',
      });
      expect(loads.at(-1)).toEqual(
        BankingActions.retrievedStatementPage({
          generation: 4,
          offset: 0,
          total: 120,
          entries: [entry],
        }),
      );
    });

    it('waits until typing pauses before it searches', async () => {
      vi.useFakeTimers();
      actions$.next(BankingActions.enterAccountStatementPage());
      setState({ filter: { period: 'all', types: [], search: 'Url' } });
      actions$.next(BankingActions.enteredStatementSearch({ search: 'Url' }));
      await vi.advanceTimersByTimeAsync(STATEMENT_SEARCH_DEBOUNCE_MS - 1);
      setState({ filter: { period: 'all', types: [], search: 'Urlaub' } });
      actions$.next(BankingActions.enteredStatementSearch({ search: 'Urlaub' }));
      await vi.advanceTimersByTimeAsync(STATEMENT_SEARCH_DEBOUNCE_MS - 1);
      expect(engine.statement).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(engine.statement).toHaveBeenCalledTimes(2);
      expect(engine.statement).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Urlaub' }),
      );
    });

    it('loads the window around the rendered rows only when they reach rows not loaded', () => {
      actions$.next(BankingActions.enterAccountStatementPage());
      const loaded = { total: 120, offset: 0, entries: new Array<StatementEntry>(50).fill(entry) };
      setState({ ...loaded, range: { start: 20, end: 30 } });
      actions$.next(BankingActions.scrolledStatement({ range: { start: 20, end: 30 } }));
      expect(engine.statement).toHaveBeenCalledTimes(1);
      setState({ ...loaded, range: { start: 35, end: 45 } });
      actions$.next(BankingActions.scrolledStatement({ range: { start: 35, end: 45 } }));
      expect(engine.statement).toHaveBeenLastCalledWith({
        accountId: 'acc-1',
        offset: 0,
        limit: 100,
      });
    });

    it('lets scrolling wait for a running load and checks the rows again when it arrives', () => {
      const reply = new Subject<EngineQueryResultOf<'statement'>>();
      engine.statement.mockReturnValue(reply);
      actions$.next(BankingActions.enterAccountStatementPage());
      setState({ total: 120, offset: 0, entries: [], range: { start: 60, end: 70 } });
      actions$.next(BankingActions.scrolledStatement({ range: { start: 60, end: 70 } }));
      expect(engine.statement).toHaveBeenCalledTimes(1);
      reply.next({ kind: 'statement', total: 120, entries: [entry], tick: 1 });
      actions$.next(loads[0]);
      expect(engine.statement).toHaveBeenCalledTimes(2);
      expect(engine.statement).toHaveBeenLastCalledWith({
        accountId: 'acc-1',
        offset: 0,
        limit: 150,
      });
      // A new query does not wait.
      actions$.next(BankingActions.clickedResetStatementFilter());
      expect(engine.statement).toHaveBeenCalledTimes(3);
    });

    it('reloads the window when a projection changes the account, not for other accounts', () => {
      actions$.next(BankingActions.enterAccountStatementPage());
      setState({ total: 120, offset: 50, entries: [entry], range: { start: 60, end: 70 } });
      const other = {
        ...projection(5, false, 0),
        accounts: [{ id: 'acc-2' } as Partial<AccountView> as AccountView],
      };
      actions$.next(BankingActions.receivedProjection({ projection: other }));
      expect(engine.statement).toHaveBeenCalledTimes(1);
      const own = {
        ...projection(6, false, 0),
        accounts: [{ id: 'acc-1' } as Partial<AccountView> as AccountView],
      };
      actions$.next(BankingActions.receivedProjection({ projection: own }));
      expect(engine.statement).toHaveBeenLastCalledWith({
        accountId: 'acc-1',
        offset: 0,
        limit: 150,
      });
    });

    it('stops loading when the page is left', () => {
      actions$.next(BankingActions.enterAccountStatementPage());
      actions$.next(BankingActions.leaveAccountStatementPage());
      actions$.next(BankingActions.clickedResetStatementFilter());
      expect(engine.statement).toHaveBeenCalledTimes(1);
    });

    it('dispatches the failure with the generation of the query', () => {
      const error = new EngineCommandError('unknown-account');
      engine.statement.mockReturnValue(throwError(() => error));
      actions$.next(BankingActions.enterAccountStatementPage());
      expect(loads).toEqual([BankingActions.loadStatementFailure({ generation: 3, error })]);
    });
  });

  describe('showStatementFailure$', () => {
    it.each([
      ['storage-failed', 1],
      ['unknown-account', 0],
      ['invalid-command', 0],
    ] as const)('shows a toast for %s %d times', (code, times) => {
      const subscription = effects.showStatementFailure$.subscribe();
      actions$.next(
        BankingActions.loadStatementFailure({ generation: 1, error: new EngineCommandError(code) }),
      );
      subscription.unsubscribe();
      expect(toasts.error).toHaveBeenCalledTimes(times);
    });
  });

  describe('loadMonthlyValues$', () => {
    /** Tick of a game time in UTC (TS §3.2), independent of the calendar functions. */
    const tickAt = (month: number, day: number, hour = 0): number =>
      (Date.UTC(2030, month - 1, day, hour) - Date.UTC(2020, 0, 1)) / 60_000;
    const values = {
      income: 250_000,
      livingCosts: 180_000,
      fees: 0,
      creditInterest: 0,
      debitInterest: 0,
      taxes: 0,
      dividends: 0,
    };
    const result = {
      kind: 'monthlyValues' as const,
      closedMonths: [],
      current: { month: { year: 2030, month: 4 }, values },
    };
    const retrieved = BankingActions.retrievedMonthlyValues({
      monthlyValues: { closedMonths: [], current: result.current },
    });

    beforeEach(() => {
      engine.monthlyValues.mockReturnValue(of(result));
      store.overrideSelector(selectPhase, 'loading');
      store.overrideSelector(selectNetWorth, 1_000_000);
      store.overrideSelector(selectTick, tickAt(4, 1, 0));
    });

    it('loads once the player is loaded', async () => {
      const loaded = firstValueFrom(effects.loadMonthlyValues$);
      actions$.next(BankingActions.enterAccountsPage());
      expect(engine.monthlyValues).not.toHaveBeenCalled();
      store.overrideSelector(selectPhase, 'loaded');
      store.refreshState();
      expect(await loaded).toEqual(retrieved);
    });

    it('loads again, throttled, when the net worth changes and when a month ends', async () => {
      store.overrideSelector(selectPhase, 'loaded');
      const loads = firstValueFrom(effects.loadMonthlyValues$.pipe(take(3), toArray()));
      actions$.next(BankingActions.enterAccountsPage());
      store.overrideSelector(selectNetWorth, 900_000);
      store.refreshState();
      // Another tick of the same month is no trigger; the first of the next month is.
      store.overrideSelector(selectTick, tickAt(4, 30, 23));
      store.refreshState();
      expect(engine.monthlyValues).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => setTimeout(resolve, MONTHLY_VALUES_THROTTLE_MS + 50));
      expect(engine.monthlyValues).toHaveBeenCalledTimes(2);
      store.overrideSelector(selectTick, tickAt(5, 1, 0));
      store.refreshState();
      expect(await loads).toEqual([retrieved, retrieved, retrieved]);
    });

    it('stops when the page is left', () => {
      store.overrideSelector(selectPhase, 'loaded');
      const subscription = effects.loadMonthlyValues$.subscribe();
      actions$.next(BankingActions.enterAccountsPage());
      actions$.next(BankingActions.leaveAccountsPage());
      store.overrideSelector(selectNetWorth, 900_000);
      store.refreshState();
      subscription.unsubscribe();
      expect(engine.monthlyValues).toHaveBeenCalledTimes(1);
    });

    it('dispatches the failure of the query', async () => {
      const error = new EngineCommandError('player-not-loaded');
      engine.monthlyValues.mockReturnValue(throwError(() => error));
      store.overrideSelector(selectPhase, 'loaded');
      const failed = firstValueFrom(effects.loadMonthlyValues$);
      actions$.next(BankingActions.enterAccountsPage());
      expect(await failed).toEqual(BankingActions.loadMonthlyValuesFailure({ error }));
    });
  });
});
