import { TaxYear } from '@app/taxes/domain/models/tax.model';

/**
 * The tax state as the UI sees it in the `projection` event (TS §7.7, §8.3; US-ST-04): the running
 * year and the closed years since the game start, oldest first. A few numbers per year, so the
 * projection always carries all of them.
 */
export interface TaxesProjection {
  current: TaxYear;
  closed: TaxYear[];
}
