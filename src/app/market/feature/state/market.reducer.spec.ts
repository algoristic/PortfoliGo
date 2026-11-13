import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { PlayerProfile } from '@app/players/domain/models/player.model';

import * as MarketActions from './market.actions';
import { initialMarketState, marketReducer, MarketState } from './market.reducer';

function quote(series: number, last = 100): SeriesQuote {
  return { series, last, bid: null, ask: null, previousClose: 100, change: 0, changeRatio: 0 };
}

function reduce(...actions: Parameters<typeof marketReducer>[1][]): MarketState {
  return actions.reduce(marketReducer, initialMarketState);
}

describe('marketReducer', () => {
  describe('quotesSubscriptionChanged', () => {
    it('stores the series sorted and without duplicates', () => {
      const state = reduce(
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [3, 1, 3] }),
      );
      expect(state.quoteSubscriptions).toEqual({ a: [1, 3] });
    });

    it('keeps the state when the set of a key is the same', () => {
      const before = reduce(MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1, 2] }));
      const after = marketReducer(
        before,
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [2, 1] }),
      );
      expect(after).toBe(before);
    });

    it('drops the quotes of series that no key watches any more', () => {
      const state = reduce(
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1, 2] }),
        MarketActions.quotesSubscriptionChanged({ key: 'b', series: [2] }),
        MarketActions.receivedQuotes({ quotes: [quote(1), quote(2)] }),
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [3] }),
      );
      expect(state.quotes.ids).toEqual([2]);
    });
  });

  describe('quotesSubscriptionEnded', () => {
    it('removes the key and the quotes only it watched', () => {
      const state = reduce(
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1, 2] }),
        MarketActions.quotesSubscriptionChanged({ key: 'b', series: [2] }),
        MarketActions.receivedQuotes({ quotes: [quote(1), quote(2)] }),
        MarketActions.quotesSubscriptionEnded({ key: 'a' }),
      );
      expect(state.quoteSubscriptions).toEqual({ b: [2] });
      expect(state.quotes.ids).toEqual([2]);
    });
  });

  describe('receivedQuotes', () => {
    it('takes only quotes of watched series and replaces older ones', () => {
      const state = reduce(
        MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1] }),
        MarketActions.receivedQuotes({ quotes: [quote(1, 100)] }),
        MarketActions.receivedQuotes({ quotes: [quote(1, 105), quote(9, 50)] }),
      );
      expect(state.quotes.ids).toEqual([1]);
      expect(state.quotes.entities[1]?.last).toBe(105);
    });
  });

  describe('movers', () => {
    const movers = { tick: 5, gainers: [quote(1)], losers: [], sectors: [] };

    it('ignores movers while no view watches them', () => {
      expect(reduce(MarketActions.receivedMovers({ movers })).movers).toBeNull();
    });

    it('keeps the movers until the last view ends its subscription', () => {
      const watched = reduce(
        MarketActions.moversSubscriptionStarted({ key: 'a' }),
        MarketActions.moversSubscriptionStarted({ key: 'b' }),
        MarketActions.moversSubscriptionStarted({ key: 'b' }),
        MarketActions.receivedMovers({ movers }),
        MarketActions.moversSubscriptionEnded({ key: 'a' }),
      );
      expect(watched.movers).toEqual(movers);
      const ended = marketReducer(watched, MarketActions.moversSubscriptionEnded({ key: 'b' }));
      expect(ended.moversSubscriptions).toEqual([]);
      expect(ended.movers).toBeNull();
    });
  });

  it('drops everything when the game is left', () => {
    const state = reduce(
      MarketActions.retrievedInstruments({ instruments: [] }),
      MarketActions.quotesSubscriptionChanged({ key: 'a', series: [1] }),
      SessionActions.leaveGame(),
    );
    expect(state).toEqual(initialMarketState);
    expect(
      marketReducer(state, SessionActions.enterGame({ profile: { id: 'p' } as PlayerProfile })),
    ).toEqual(initialMarketState);
  });
});
