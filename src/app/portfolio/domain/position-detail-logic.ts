import { isPlayerAccount } from '@app/banking/domain/ledger-logic';
import { DepotId } from '@app/banking/domain/models/account.model';
import { TextParams, Transaction } from '@app/banking/domain/models/ledger.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

import { costPerShare } from './lot-logic';
import {
  DepotPosition,
  DetailLot,
  PositionDetail,
  PositionTrade,
  PositionTrades,
} from './models/position-detail.model';
import { positionOverview } from './position-overview-logic';

/**
 * The position of an instrument in the shown depots (US-PF-06): the head figures as in the depot
 * overview (TS §7.9; all depots combined), the realized gain and the distributions summed over
 * the depots, and the lots of every depot ordered by purchase time (ties in depot order), each
 * with its cost per share. `null` when no shown depot holds shares.
 */
export function positionDetail(
  parts: readonly DepotPosition[],
  name: string,
  bid: number | null,
): PositionDetail | null {
  const held = parts.filter((part) => part.quantity > 0);
  if (held.length === 0) {
    return null;
  }
  const quantity = held.reduce((sum, part) => sum + part.quantity, 0);
  const cost = held.reduce((sum, part) => sum + part.cost, 0);
  const instrumentId = held[0].instrumentId;
  const {
    rows: [figures],
  } = positionOverview([{ instrumentId, name, quantity, cost, bid }]);
  const lots = held
    .flatMap((part) =>
      part.lots.map((lot): DetailLot => ({
        ...lot,
        depotId: part.depotId,
        costPerShare: costPerShare(lot.cost, lot.quantity),
      })),
    )
    .sort((a, b) => a.buyTick - b.buyTick);
  return {
    instrumentId,
    quantity,
    cost,
    averageCost: figures.averageCost,
    price: figures.price,
    value: figures.value,
    gain: figures.gain,
    gainRatio: figures.gainRatio,
    realizedGain: held.reduce((sum, part) => sum + part.realizedGain, 0),
    distributions: held.reduce((sum, part) => sum + part.distributions, 0),
    lots,
  };
}

/**
 * Executed purchases and sales of an instrument in the shown depots (`null` = all) from the journal
 * (in journal order): order executions and savings plan purchases (`buy`/`sell` with a unit posting
 * of the instrument in a shown depot, TS §7.5, §7.8), the newest `limit` of them newest first, and
 * the number of all. Costs are the order and the exchange fee, the total is the debit or credit on
 * the clearing account.
 */
export function positionTrades(
  journal: readonly Transaction[],
  instrumentId: string,
  depotIds: readonly DepotId[] | null,
  limit: number,
): PositionTrades {
  const shown = depotIds === null ? null : new Set(depotIds);
  const trades: PositionTrade[] = [];
  let total = 0;
  for (let i = journal.length - 1; i >= 0; i--) {
    const transaction = journal[i];
    if (transaction.type !== 'buy' && transaction.type !== 'sell') {
      continue;
    }
    const unit = transaction.units?.find(
      (posting) =>
        posting.instrumentId === instrumentId && (shown === null || shown.has(posting.depotId)),
    );
    const price = transaction.params?.['price'];
    if (unit === undefined || typeof price !== 'number') {
      continue;
    }
    if (trades.length < limit) {
      trades.push(tradeOf(transaction, unit.depotId, Math.abs(unit.quantity), price));
    }
    total++;
  }
  return { trades, total };
}

function tradeOf(
  transaction: Transaction,
  depotId: DepotId,
  quantity: MicroUnits,
  price: number,
): PositionTrade {
  const refs = transaction.refs ?? {};
  const params = transaction.params ?? {};
  let total: Cents = 0;
  for (const posting of transaction.postings) {
    if (isPlayerAccount(posting.account)) {
      total += posting.amount;
    }
  }
  return {
    seq: transaction.seq,
    orderId: refs['orderId'] ?? null,
    savingsPlanId: refs['savingsPlanId'] ?? null,
    depotId,
    side: transaction.type === 'sell' ? 'sell' : 'buy',
    tick: transaction.tick,
    quantity,
    price,
    costs: centsParam(params, 'orderFee') + centsParam(params, 'exchangeFee'),
    total: Math.abs(total),
  };
}

function centsParam(params: TextParams, key: string): Cents {
  const value = params[key];
  return typeof value === 'number' ? value : 0;
}
