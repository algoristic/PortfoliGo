import { createFeatureSelector, createSelector } from '@ngrx/store';

import { lotTotals } from '@app/portfolio/domain/lot-logic';
import { Lot } from '@app/portfolio/domain/models/lot.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { saleTaxPreview, taxYearSummary } from '@app/taxes/domain/tax-logic';

import { TAXES_FEATURE_KEY, TaxesState } from './taxes.reducer';

const selectTaxesState = createFeatureSelector<TaxesState>(TAXES_FEATURE_KEY);

/** The running tax year; `null` until the first projection. */
export const selectCurrentTaxYear = createSelector(selectTaxesState, (state) => state.current);

/** The closed tax years, oldest first. */
export const selectClosedTaxYears = createSelector(selectTaxesState, (state) => state.closed);

/**
 * Figures of every tax year for the tax overview (US-ST-04), newest first: the running year so far,
 * then the closed ones; empty until the first projection.
 */
export const selectTaxOverview = createSelector(
  selectCurrentTaxYear,
  selectClosedTaxYears,
  (current, closed) =>
    current === null ? [] : [current, ...closed.slice().reverse()].map(taxYearSummary),
);

/** Figures of the running tax year (US-ST-04); `null` until the first projection. */
export const selectCurrentTaxSummary = createSelector(selectCurrentTaxYear, (current) =>
  current === null ? null : taxYearSummary(current),
);

/**
 * Tax preview of a sale of `quantity` shares of a position with `lots` for `proceeds` after costs
 * (US-HD-02, AP 5.4): `null` until the first projection and for a quantity the lots do not hold.
 */
export const selectSaleTaxPreview = (lots: readonly Lot[], quantity: MicroUnits, proceeds: Cents) =>
  createSelector(selectCurrentTaxYear, (current) =>
    current === null ||
    !Number.isSafeInteger(quantity) ||
    !Number.isSafeInteger(proceeds) ||
    quantity <= 0 ||
    quantity > lotTotals(lots).quantity
      ? null
      : saleTaxPreview(current, lots, quantity, proceeds),
  );
