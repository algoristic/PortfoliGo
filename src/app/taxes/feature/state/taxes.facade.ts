import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';
import { Observable } from 'rxjs';

import { Lot } from '@app/portfolio/domain/models/lot.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { SaleTaxPreview } from '@app/taxes/domain/models/tax.model';

import * as TaxesSelectors from './taxes.selectors';

@Injectable()
export class TaxesFacade {
  readonly #store = inject(Store);

  currentTaxYear$ = this.#store.pipe(select(TaxesSelectors.selectCurrentTaxYear));
  currentTaxSummary$ = this.#store.pipe(select(TaxesSelectors.selectCurrentTaxSummary));
  taxOverview$ = this.#store.pipe(select(TaxesSelectors.selectTaxOverview));

  saleTaxPreview$(
    lots: readonly Lot[],
    quantity: MicroUnits,
    proceeds: Cents,
  ): Observable<SaleTaxPreview | null> {
    return this.#store.pipe(select(TaxesSelectors.selectSaleTaxPreview(lots, quantity, proceeds)));
  }
}
