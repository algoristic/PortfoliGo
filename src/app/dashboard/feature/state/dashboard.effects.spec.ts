import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import { LocalStorageService } from '@app/persistence/data-access/local-storage/local-storage.service';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as DashboardActions from './dashboard.actions';
import { DashboardEffects } from './dashboard.effects';
import { selectFirstStepsPlayerId, selectFirstStepsSettings } from './dashboard.selectors';

describe('DashboardEffects', () => {
  let effects: DashboardEffects;
  let actions$: Subject<Action>;
  let store: MockStore;

  beforeEach(() => {
    localStorage.clear();
    actions$ = new Subject();
    TestBed.configureTestingModule({
      providers: [
        DashboardEffects,
        LocalStorageService,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore(),
        { provide: EngineService, useValue: {} },
        { provide: ToastService, useValue: { error: vi.fn() } },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(DashboardEffects);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  function stored(): unknown {
    return JSON.parse(localStorage.getItem('pgo.ui.firstSteps') ?? 'null');
  }

  describe('saveFirstSteps$', () => {
    it('writes the player’s entry and keeps the entries of other players', () => {
      localStorage.setItem(
        'pgo.ui.firstSteps',
        JSON.stringify({ v: 1, data: { other: { hidden: true, banksVisited: false } } }),
      );
      store.overrideSelector(selectFirstStepsPlayerId, 'p1');
      store.overrideSelector(selectFirstStepsSettings, { hidden: false, banksVisited: true });
      const subscription = effects.saveFirstSteps$.subscribe();
      actions$.next(BankingActions.enterBanksPage());
      subscription.unsubscribe();
      expect(stored()).toEqual({
        v: 1,
        data: {
          other: { hidden: true, banksVisited: false },
          p1: { hidden: false, banksVisited: true },
        },
      });
    });

    it('saves showing the checklist again', () => {
      store.overrideSelector(selectFirstStepsPlayerId, 'p1');
      store.overrideSelector(selectFirstStepsSettings, { hidden: false, banksVisited: false });
      const subscription = effects.saveFirstSteps$.subscribe();
      actions$.next(DashboardActions.clickedShowFirstSteps());
      subscription.unsubscribe();
      expect(stored()).toEqual({ v: 1, data: { p1: { hidden: false, banksVisited: false } } });
    });

    it('writes nothing before a player is loaded', () => {
      store.overrideSelector(selectFirstStepsPlayerId, null);
      store.overrideSelector(selectFirstStepsSettings, { hidden: true, banksVisited: false });
      const subscription = effects.saveFirstSteps$.subscribe();
      actions$.next(DashboardActions.clickedHideFirstSteps());
      subscription.unsubscribe();
      expect(stored()).toBeNull();
    });
  });
});
