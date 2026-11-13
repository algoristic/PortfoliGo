import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import { DepotId } from '@app/banking/domain/models/account.model';
import { PositionSortKey } from '@app/portfolio/domain/models/portfolio.model';

import * as PortfolioActions from './portfolio.actions';
import * as PortfolioSelectors from './portfolio.selectors';

@Injectable()
export class PortfolioFacade {
  readonly #store = inject(Store);

  loaded$ = this.#store.pipe(select(PortfolioSelectors.selectPortfolioLoaded));
  view$ = this.#store.pipe(select(PortfolioSelectors.selectPortfolioView));

  enterPortfolioPage(): void {
    this.#store.dispatch(PortfolioActions.enterPortfolioPage());
  }

  leavePortfolioPage(): void {
    this.#store.dispatch(PortfolioActions.leavePortfolioPage());
  }

  selectDepot(depotId: DepotId | null): void {
    this.#store.dispatch(PortfolioActions.selectedDepot({ depotId }));
  }

  sortPositions(key: PositionSortKey): void {
    this.#store.dispatch(PortfolioActions.selectedPositionSort({ key }));
  }

  clickOpenDepot(): void {
    this.#store.dispatch(PortfolioActions.clickedOpenDepot());
  }
}
