import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { EngineCommandError } from '@app/engine/data-access/service/engine.service';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { ORDER_COMMAND_ERRORS, OrderSpec } from '@app/trading/domain/models/order.model';
import { SAVINGS_PLAN_COMMAND_ERRORS } from '@app/trading/domain/models/savings-plan.model';
import { OrderTicketContext } from '@app/trading/ui/models/order-ticket.model';

import {
  orderCommandFailureMessage,
  placeOrderShortfall,
  savingsPlanCommandFailureMessage,
} from './trading-errors.utils';

// TS §7.5: bank F, Geld 99,90 € / Brief 100,10 €, 2.000,00 € with 500,00 € reserved.
const F: DepotConditions = {
  custodyFee: { kind: 'none' },
  orderFee: { kind: 'percent', rate: 0.0025, min: 1_000, max: 6_000 },
  exchangeFee: 300,
  savingsPlanFee: { kind: 'free' },
  clearingAccountRate: 0,
  clearingAccountDebitRate: 0.1,
  venue: 'exchange',
  spreadMarkup: 0,
  fractionalShares: false,
};

const CONTEXT: OrderTicketContext = {
  instrument: { id: 'stk-1', kind: 'stock', name: 'Astix', series: 0 } as Instrument,
  quote: { last: 100, bid: 99.9, ask: 100.1 },
  atPriceFloor: false,
  marketOpen: true,
  tick: 5_390_520,
  depots: [
    {
      depotId: 'dep-2',
      number: '0000000002',
      bankName: 'F',
      conditions: F,
      clearingBalance: 200_000,
      reserved: 50_000,
      position: null,
    },
  ],
  taxYear: null,
};

const ORDER: OrderSpec = {
  depotId: 'dep-2',
  instrumentId: 'stk-1',
  side: 'buy',
  type: 'market',
  size: { kind: 'quantity', quantity: 15_000_000 },
  limit: null,
  stop: null,
  validity: { kind: 'day' },
};

describe('orderCommandFailureMessage', () => {
  it('has its own text for every code of the order rules', () => {
    const texts = ORDER_COMMAND_ERRORS.map((code) =>
      orderCommandFailureMessage('placeOrder', new EngineCommandError(code)),
    );
    expect(new Set(texts).size).toBe(ORDER_COMMAND_ERRORS.length);
    expect(texts).not.toContain('Die Order konnte nicht erteilt werden.');
  });

  it('names the shortfall of insufficient funds (US-HD-01)', () => {
    expect(
      orderCommandFailureMessage('placeOrder', new EngineCommandError('insufficient-funds'), 8_958),
    ).toBe('Das Guthaben auf dem Verrechnungskonto reicht nicht, es fehlen 89,58 €.');
  });

  it.each([
    ['placeOrder', 'Die Order konnte nicht erteilt werden.'],
    ['changeOrder', 'Die Order konnte nicht geändert werden.'],
    ['cancelOrder', 'Die Order konnte nicht storniert werden.'],
  ] as const)('falls back to what %s could not do', (command, text) => {
    expect(orderCommandFailureMessage(command, new Error('worker gone'))).toBe(text);
  });
});

describe('placeOrderShortfall', () => {
  it('estimates the shortfall like the ticket (TS §7.5: market 15 shares)', () => {
    expect(placeOrderShortfall(ORDER, CONTEXT)).toBe(8_958);
  });

  it('has none for sales, unknown depots or without context', () => {
    expect(placeOrderShortfall({ ...ORDER, side: 'sell' }, CONTEXT)).toBeNull();
    expect(placeOrderShortfall({ ...ORDER, depotId: 'dep-9' }, CONTEXT)).toBeNull();
    expect(placeOrderShortfall(ORDER, null)).toBeNull();
  });
});

describe('savingsPlanCommandFailureMessage', () => {
  it('words every code of the savings plan rules', () => {
    const texts = SAVINGS_PLAN_COMMAND_ERRORS.map((code) =>
      savingsPlanCommandFailureMessage('createSavingsPlan', new EngineCommandError(code)),
    );
    expect(new Set(texts).size).toBe(SAVINGS_PLAN_COMMAND_ERRORS.length);
    expect(
      savingsPlanCommandFailureMessage(
        'createSavingsPlan',
        new EngineCommandError('not-savings-plan-eligible'),
      ),
    ).toBe(
      'Für dieses Wertpapier gibt es keinen Sparplan. Sparplanfähig sind ETFs und große Aktien.',
    );
  });

  it('names the command when the reason is unknown', () => {
    expect(savingsPlanCommandFailureMessage('deleteSavingsPlan', new Error('x'))).toBe(
      'Der Sparplan konnte nicht gelöscht werden.',
    );
    expect(
      savingsPlanCommandFailureMessage('changeSavingsPlan', new EngineCommandError('busy')),
    ).toBe('Das geht gerade nicht, weil die Spielzeit noch berechnet wird.');
  });
});
