import { regionLabels } from '@app/clock/ui/labels/region-labels';
import { sectorLabel } from '@app/market/ui/labels/taxonomy-labels';
import {
  AssetClass,
  RegionKey,
  SectorKey,
  UNASSIGNED,
} from '@app/portfolio/domain/models/allocation.model';
import { PositionSortKey } from '@app/portfolio/domain/models/portfolio.model';
import { OrderSide } from '@app/trading/domain/models/order.model';

export function assetClassLabel(assetClass: AssetClass): string {
  switch (assetClass) {
    case 'stock':
      return $localize`:@@uiPortfolio-portfolioLabels-stock:Aktien`;
    case 'etf':
      return $localize`:@@uiPortfolio-portfolioLabels-etf:ETFs`;
    case 'cash':
      return $localize`:@@uiPortfolio-portfolioLabels-cash:Liquidität`;
  }
}

function unassignedLabel(): string {
  return $localize`:@@uiPortfolio-portfolioLabels-unassigned:Nicht zugeordnet`;
}

export function regionKeyLabel(key: RegionKey): string {
  return key === UNASSIGNED ? unassignedLabel() : regionLabels(key).label;
}

export function sectorKeyLabel(key: SectorKey): string {
  return key === UNASSIGNED ? unassignedLabel() : sectorLabel(key);
}

/** Column names of the position table (US-PF-02). */
export function positionColumnLabel(key: PositionSortKey): string {
  switch (key) {
    case 'name':
      return $localize`:@@uiPortfolio-portfolioLabels-name:Wertpapier`;
    case 'quantity':
      return $localize`:@@uiPortfolio-portfolioLabels-quantity:Stück`;
    case 'averageCost':
      return $localize`:@@uiPortfolio-portfolioLabels-averageCost:Einstandskurs`;
    case 'price':
      return $localize`:@@uiPortfolio-portfolioLabels-price:Kurs`;
    case 'value':
      return $localize`:@@uiPortfolio-portfolioLabels-value:Wert`;
    case 'gain':
      return $localize`:@@uiPortfolio-portfolioLabels-gain:G/V`;
    case 'gainRatio':
      return $localize`:@@uiPortfolio-portfolioLabels-gainRatio:G/V %`;
    case 'share':
      return $localize`:@@uiPortfolio-portfolioLabels-share:Anteil`;
  }
}

/** Kind of a trade in the position detail (US-PF-06). */
export function tradeSideLabel(side: OrderSide): string {
  return side === 'buy'
    ? $localize`:@@uiPortfolio-portfolioLabels-purchase:Kauf`
    : $localize`:@@uiPortfolio-portfolioLabels-sale:Verkauf`;
}
