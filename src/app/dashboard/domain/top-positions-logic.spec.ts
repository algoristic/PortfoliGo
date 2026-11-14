import { HeldPosition } from '@app/portfolio/domain/models/portfolio.model';

import { topPositions } from './top-positions-logic';

function held(instrumentId: string, shares: number, bid: number | null): HeldPosition {
  return { instrumentId, name: instrumentId, quantity: shares * 1_000_000, cost: 100, bid };
}

describe('topPositions', () => {
  it('combines the depots, takes the largest values first and puts missing quotes last', () => {
    const positions = [
      held('B', 1, 50),
      held('A', 2, 10),
      held('C', 1, null),
      held('A', 3, 10),
      held('D', 1, 20),
      held('E', 1, 5),
      held('F', 1, 49),
    ];
    // A: 5 × 10 € = 50 €, ties with B by name; C without a quote is cut as the sixth.
    expect(topPositions(positions).map(({ instrumentId, value }) => [instrumentId, value])).toEqual(
      [
        ['A', 5_000],
        ['B', 5_000],
        ['F', 4_900],
        ['D', 2_000],
        ['E', 500],
      ],
    );
  });

  it('lists fewer positions when there are fewer', () => {
    expect(topPositions([held('A', 1, 1)], 5)).toHaveLength(1);
    expect(topPositions([], 5)).toEqual([]);
  });
});
