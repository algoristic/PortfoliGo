import { IndexComposition } from '@app/market/domain/models/instrument-figures.model';

/** Quote subscription of the depot page (TS §8.4, §11.3). */
export const PORTFOLIO_SUBSCRIPTION = 'portfolio';

/** The composition of an ETF's index as of the close before the market day `day` (TS §8.2). */
export interface LoadedComposition {
  day: number;
  /** `null` when the engine has none (not an ETF). */
  composition: IndexComposition | null;
}
