import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, take, throwError, toArray } from 'rxjs';
import type { Mocked } from 'vitest';

import { selectTick } from '@app/clock/feature/state/clock.selectors';
import { EngineQueryResultOf } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import { IndexComposition } from '@app/market/domain/models/instrument-figures.model';
import * as MarketActions from '@app/market/feature/state/market.actions';
import { selectInstrumentsLoaded } from '@app/market/feature/state/market.selectors';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as PortfolioActions from './portfolio.actions';
import { PortfolioEffects } from './portfolio.effects';
import {
  selectHistoryRange,
  selectMissingCompositions,
  selectPerformanceDay,
  selectPortfolioSeries,
} from './portfolio.selectors';

const COMPOSITION = { indexId: 'idx-1' } as IndexComposition;

describe('PortfolioEffects', () => {
  let effects: PortfolioEffects;
  let actions$: Subject<Action>;
  let store: MockStore;
  let engine: Mocked<Pick<EngineService, 'instrumentComposition' | 'performanceHistory'>>;

  beforeEach(() => {
    actions$ = new Subject();
    engine = { instrumentComposition: vi.fn(), performanceHistory: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PortfolioEffects,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore(),
        { provide: EngineService, useValue: engine },
        { provide: ToastService, useValue: { error: vi.fn() } },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectInstrumentsLoaded, true);
    store.overrideSelector(selectTick, 1_000);
    store.overrideSelector(selectPortfolioSeries, [2, 4]);
    store.overrideSelector(selectMissingCompositions, { day: 7, ids: [] });
    effects = TestBed.inject(PortfolioEffects);
  });

  describe('loadPerformanceHistory$', () => {
    // 15.05.2031 (day 4152 since 01.01.2020): one month back is 15.04.2031, `max` asks for all.
    const DAY = 4_152;
    const result = (tick: number): EngineQueryResultOf<'performanceHistory'> => ({
      kind: 'performanceHistory',
      points: [],
      resolution: 'day',
      total: 0,
      tick,
    });

    it('loads the selected period on entering, on a new period and after a day end', async () => {
      engine.performanceHistory.mockImplementation((request) => of(result(request?.fromDay ?? -1)));
      store.overrideSelector(selectHistoryRange, '1m');
      store.overrideSelector(selectPerformanceDay, DAY);
      const loaded = firstValueFrom(effects.loadPerformanceHistory$.pipe(take(3), toArray()));
      actions$.next(PortfolioActions.enterPerformanceHistory());
      store.overrideSelector(selectHistoryRange, 'max');
      store.refreshState();
      store.overrideSelector(selectPerformanceDay, DAY + 1);
      store.refreshState();
      expect(await loaded).toEqual([
        PortfolioActions.retrievedPerformanceHistory({ range: '1m', history: result(DAY - 30) }),
        PortfolioActions.retrievedPerformanceHistory({ range: 'max', history: result(-1) }),
        PortfolioActions.retrievedPerformanceHistory({ range: 'max', history: result(-1) }),
      ]);
      expect(engine.performanceHistory.mock.calls).toEqual([[{ fromDay: DAY - 30 }], [{}], [{}]]);
    });

    it('waits for the first figures and stops after leaving', async () => {
      engine.performanceHistory.mockReturnValue(throwError(() => new Error('down')));
      store.overrideSelector(selectHistoryRange, '1y');
      store.overrideSelector(selectPerformanceDay, null);
      const emitted: Action[] = [];
      const subscription = effects.loadPerformanceHistory$.subscribe((action) =>
        emitted.push(action),
      );
      actions$.next(PortfolioActions.enterPerformanceHistory());
      expect(emitted).toEqual([]);
      store.overrideSelector(selectPerformanceDay, DAY);
      store.refreshState();
      expect(emitted).toEqual([
        PortfolioActions.loadPerformanceHistoryFailure({ range: '1y', error: new Error('down') }),
      ]);
      actions$.next(PortfolioActions.leavePerformanceHistory());
      store.overrideSelector(selectPerformanceDay, DAY + 1);
      store.refreshState();
      expect(emitted).toHaveLength(1);
      subscription.unsubscribe();
    });
  });

  describe('watchPortfolioQuotes$', () => {
    it('follows the held series until the page is left', async () => {
      const result = firstValueFrom(effects.watchPortfolioQuotes$.pipe(take(2), toArray()));
      actions$.next(PortfolioActions.enterPortfolioPage());
      // The same set again sends nothing new.
      store.overrideSelector(selectPortfolioSeries, [2, 4]);
      store.refreshState();
      store.overrideSelector(selectPortfolioSeries, [2]);
      store.refreshState();
      expect(await result).toEqual([
        MarketActions.quotesSubscriptionChanged({ key: 'portfolio', series: [2, 4] }),
        MarketActions.quotesSubscriptionChanged({ key: 'portfolio', series: [2] }),
      ]);
    });
  });

  describe('requestCompositions$', () => {
    it('requests the missing compositions once the clock is known', async () => {
      store.overrideSelector(selectTick, null);
      store.overrideSelector(selectMissingCompositions, { day: 7, ids: ['etf-1'] });
      const result = firstValueFrom(effects.requestCompositions$);
      actions$.next(PortfolioActions.enterPortfolioPage());
      store.overrideSelector(selectTick, 1_000);
      store.refreshState();
      expect(await result).toEqual(
        PortfolioActions.requestedCompositions({ day: 7, ids: ['etf-1'] }),
      );
    });
  });

  describe('loadCompositions$', () => {
    it('reports each composition and each failure with its market day', async () => {
      const error = new Error('down');
      engine.instrumentComposition.mockImplementation((id) =>
        id === 'etf-1'
          ? of({ kind: 'instrumentComposition' as const, composition: COMPOSITION, tick: 1 })
          : throwError(() => error),
      );
      const result = firstValueFrom(effects.loadCompositions$.pipe(take(2), toArray()));
      actions$.next(PortfolioActions.requestedCompositions({ day: 7, ids: ['etf-1', 'etf-2'] }));
      expect(await result).toEqual([
        PortfolioActions.retrievedComposition({
          day: 7,
          instrumentId: 'etf-1',
          composition: COMPOSITION,
        }),
        PortfolioActions.loadCompositionFailure({ day: 7, instrumentId: 'etf-2', error }),
      ]);
    });
  });
});
