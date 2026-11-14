import { IndexComposition } from '@app/market/domain/models/instrument-figures.model';

import * as PortfolioActions from './portfolio.actions';
import { initialPortfolioState, portfolioReducer } from './portfolio.reducer';

const OLD = { indexId: 'old' } as IndexComposition;
const NEW = { indexId: 'new' } as IndexComposition;

describe('portfolioReducer', () => {
  it('keeps a composition of a later market day and clears only the matching request', () => {
    let state = portfolioReducer(
      initialPortfolioState,
      PortfolioActions.requestedCompositions({ day: 8, ids: ['etf-1'] }),
    );
    state = portfolioReducer(
      { ...state, compositions: { 'etf-1': { day: 8, composition: NEW } } },
      PortfolioActions.retrievedComposition({ day: 7, instrumentId: 'etf-1', composition: OLD }),
    );
    expect(state.compositions['etf-1']).toEqual({ day: 8, composition: NEW });
    expect(state.loading).toEqual({ 'etf-1': 8 });
    state = portfolioReducer(
      state,
      PortfolioActions.loadCompositionFailure({ day: 8, instrumentId: 'etf-1', error: 'x' }),
    );
    expect(state.loading).toEqual({});
    expect(state.failed).toEqual({ 'etf-1': 8 });
  });

  it('takes a series only for the selected period and keeps the last one while another loads', () => {
    const history = { points: [], resolution: 'day' as const, total: 0, tick: 99 };
    let state = portfolioReducer(
      initialPortfolioState,
      PortfolioActions.selectedHistoryRange({ range: '1m' }),
    );
    state = portfolioReducer(
      state,
      PortfolioActions.retrievedPerformanceHistory({ range: '1m', history }),
    );
    expect(state.history).toEqual({ range: '1m', points: [], resolution: 'day', tick: 99 });
    expect(state.historyLoading).toBe(false);

    state = portfolioReducer(state, PortfolioActions.selectedHistoryRange({ range: 'max' }));
    expect(state.historyLoading).toBe(true);
    // A late answer for the period before changes nothing.
    const late = portfolioReducer(
      state,
      PortfolioActions.retrievedPerformanceHistory({
        range: '1m',
        history: { ...history, tick: 120 },
      }),
    );
    expect(late).toBe(state);
    expect(
      portfolioReducer(
        state,
        PortfolioActions.loadPerformanceHistoryFailure({ range: '1m', error: 'x' }),
      ),
    ).toBe(state);
    state = portfolioReducer(
      state,
      PortfolioActions.loadPerformanceHistoryFailure({ range: 'max', error: 'x' }),
    );
    expect(state).toMatchObject({
      historyLoading: false,
      historyFailed: true,
      historyRange: 'max',
    });
    expect(state.history?.range).toBe('1m');
  });
});
