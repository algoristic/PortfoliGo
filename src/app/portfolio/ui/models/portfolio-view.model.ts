import { DepotId } from '@app/banking/domain/models/account.model';
import {
  AllocationEntry,
  AssetClass,
  RegionKey,
  SectorKey,
} from '@app/portfolio/domain/models/allocation.model';
import {
  PositionFigures,
  PositionSort,
  PositionTotals,
} from '@app/portfolio/domain/models/portfolio.model';
import { Cents } from '@app/shared/domain/models/money.model';

/** A depot of the depot choice: number and bank. */
export interface DepotOption {
  depotId: DepotId;
  number: string;
  /** `null` until the banks are loaded. */
  bankName: string | null;
}

/** A row of the position table: the figures plus the depot its actions trade in. */
export interface PositionRow extends PositionFigures {
  /** The shown depot; `null` in the combined view (the order ticket preselects one). */
  depotId: DepotId | null;
}

/** Allocation of the shown depots (US-PF-03); `null` while a quote is missing. */
export interface PortfolioAllocation {
  assetClasses: AllocationEntry<AssetClass>[];
  regions: AllocationEntry<RegionKey>[];
  sectors: AllocationEntry<SectorKey>[];
  /** Compositions of held ETFs are still loading; regions and sectors are not final yet. */
  lookThroughPending: boolean;
}

/** The depot page (US-PF-02, US-PF-03). */
export interface PortfolioView {
  depots: DepotOption[];
  /** The shown depot; `null` = all depots combined. */
  depotId: DepotId | null;
  rows: PositionRow[];
  totals: PositionTotals;
  /** Money on the accounts counted as „Liquidität“: the shown depot's clearing account, else all. */
  cash: Cents;
  sort: PositionSort;
  allocation: PortfolioAllocation | null;
}
