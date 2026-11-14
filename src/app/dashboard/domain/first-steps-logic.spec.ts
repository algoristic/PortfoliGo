import { firstSteps, firstStepsDone } from './first-steps-logic';
import { FirstStepsFacts } from './models/first-steps.model';

const NEW_PLAYER: FirstStepsFacts = {
  banksVisited: false,
  depots: 0,
  clearingBalances: [],
  positions: 0,
  executedOrders: 0,
  savingsPlans: 0,
};

describe('firstSteps', () => {
  // TS §11.3 „Erste Schritte“: Banken vergleichen, Depot eröffnen, Geld überweisen, erstes
  // Wertpapier kaufen, Sparplan anlegen.
  it.each<[string, Partial<FirstStepsFacts>, boolean[]]>([
    ['a new player', {}, [false, false, false, false, false]],
    ['after the bank comparison', { banksVisited: true }, [true, false, false, false, false]],
    [
      'with an empty depot',
      { depots: 1, clearingBalances: [0] },
      [false, true, false, false, false],
    ],
    [
      'after a transfer to the clearing account',
      { depots: 1, clearingBalances: [50_000] },
      [false, true, true, false, false],
    ],
    [
      'with a negative clearing account only',
      { depots: 1, clearingBalances: [-100] },
      [false, true, false, false, false],
    ],
    [
      'with a position',
      { depots: 1, clearingBalances: [0], positions: 1 },
      [false, true, true, true, false],
    ],
    [
      'after selling the first purchase',
      { depots: 1, clearingBalances: [0], executedOrders: 2 },
      [false, true, true, true, false],
    ],
    [
      'with a paused savings plan',
      { depots: 1, clearingBalances: [0], savingsPlans: 1 },
      [false, true, false, false, true],
    ],
  ])('checks the steps of %s', (_name, facts, done) => {
    const steps = firstSteps({ ...NEW_PLAYER, ...facts });
    expect(steps.map(({ id }) => id)).toEqual([
      'compare-banks',
      'open-depot',
      'transfer',
      'first-purchase',
      'savings-plan',
    ]);
    expect(steps.map((step) => step.done)).toEqual(done);
    expect(firstStepsDone(steps)).toBe(done.filter(Boolean).length);
  });
});
