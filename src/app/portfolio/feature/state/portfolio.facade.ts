import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import { DepotId } from '@app/banking/domain/models/account.model';
import { HistoryRange } from '@app/portfolio/domain/models/performance.model';
import { PositionSortKey } from '@app/portfolio/domain/models/portfolio.model';

import * as PortfolioActions from './portfolio.actions';
import * as PortfolioSelectors from './portfolio.selectors';

@Injectable()
export class PortfolioFacade {
  readonly #store = inject(Store);

  loaded$ = this.#store.pipe(select(PortfolioSelectors.selectPortfolioLoaded));
  view$ = this.#store.pipe(select(PortfolioSelectors.selectPortfolioView));
  positionDetail$ = this.#store.pipe(select(PortfolioSelectors.selectPositionDetailView));
  /** Live performance figures (AP 5.7), `null` before the first projection. */
  performance$ = this.#store.pipe(select(PortfolioSelectors.selectPerformanceFigures));
  /** The net worth chart: period, series and loading state (US-PF-04). */
  performanceHistory$ = this.#store.pipe(select(PortfolioSelectors.selectPerformanceHistory));

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

  enterPositionPage(): void {
    this.#store.dispatch(PortfolioActions.enterPositionPage());
  }

  leavePositionPage(): void {
    this.#store.dispatch(PortfolioActions.leavePositionPage());
  }

  enterPerformanceHistory(): void {
    this.#store.dispatch(PortfolioActions.enterPerformanceHistory());
  }

  leavePerformanceHistory(): void {
    this.#store.dispatch(PortfolioActions.leavePerformanceHistory());
  }

  selectHistoryRange(range: HistoryRange): void {
    this.#store.dispatch(PortfolioActions.selectedHistoryRange({ range }));
  }

  clickOpenDepot(): void {
    this.#store.dispatch(PortfolioActions.clickedOpenDepot());
  }
}
