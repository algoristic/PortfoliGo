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
});
