import { DepotId } from '@app/banking/domain/models/account.model';
import { MicroUnits } from '@app/shared/domain/models/money.model';

/**
 * Shares of an instrument in a depot (TS §7.6), kept by the engine from the unit postings of the
 * executions. AP 5.2 adds the lots (`buyTick`, `quantity`, `cost`) whose quantities sum to
 * `quantity`.
 */
export interface Position {
  depotId: DepotId;
  instrumentId: string;
  quantity: MicroUnits;
}
