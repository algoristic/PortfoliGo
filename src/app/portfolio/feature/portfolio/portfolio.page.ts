import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { distinctUntilChanged, map, switchMap } from 'rxjs';

import { DepotId } from '@app/banking/domain/models/account.model';
import { PositionSortKey } from '@app/portfolio/domain/models/portfolio.model';
import { AllocationComponent } from '@app/portfolio/ui/allocation/allocation.component';
import { PositionRow } from '@app/portfolio/ui/models/portfolio-view.model';
import { PortfolioSummaryComponent } from '@app/portfolio/ui/portfolio-summary/portfolio-summary.component';
import { PositionTableComponent } from '@app/portfolio/ui/position-table/position-table.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { SavingsPlanId } from '@app/trading/domain/models/savings-plan.model';
import { TradingFacade } from '@app/trading/feature/state/trading.facade';
import { SavingsPlanPauseChange } from '@app/trading/ui/models/savings-plan.model';
import { SavingsPlanListComponent } from '@app/trading/ui/savings-plan-list/savings-plan-list.component';

import { PortfolioFacade } from '../state/portfolio.facade';

/** Value of the depot choice for all depots combined. */
const ALL_DEPOTS = 'all';

/**
 * Depot overview (US-PF-02, US-PF-03): one depot or all combined, the positions with value and
 * gain, „Kaufen“ and „Verkaufen“ per position, the savings plans of the shown depots (US-HD-05)
 * and the allocation with look-through of the ETFs.
 */
@Component({
  selector: 'app-portfolio-page',
  imports: [
    CommonModule,
    RouterModule,
    AllocationComponent,
    ButtonDirective,
    EmptyStateComponent,
    IconDirective,
    PanelComponent,
    PortfolioSummaryComponent,
    PositionTableComponent,
    SavingsPlanListComponent,
    SkeletonComponent,
  ],
  templateUrl: './portfolio.page.html',
  host: { class: 'block' },
})
export class PortfolioPage {
  portfolioFacade = inject(PortfolioFacade);
  readonly #tradingFacade = inject(TradingFacade);
  readonly #breakpointObserver = inject(BreakpointObserver);

  allDepots = ALL_DEPOTS;

  wide = toSignal(
    this.#breakpointObserver.observe('(min-width: 48rem)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** The savings plans of the shown depot, or of all depots (US-HD-05, AP 5.6b). */
  savingsPlans$ = this.portfolioFacade.view$.pipe(
    map((view) => view?.depotId ?? null),
    distinctUntilChanged(),
    switchMap((depotId) => this.#tradingFacade.depotSavingsPlanEntries$(depotId)),
  );

  depotLabel = $localize`:@@featurePortfolio-portfolioPage-depot:Depot`;
  positionsHeading = $localize`:@@featurePortfolio-portfolioPage-positions:Positionen`;
  allocationHeading = $localize`:@@featurePortfolio-portfolioPage-allocation:Allokation`;
  savingsPlansHeading = $localize`:@@featurePortfolio-portfolioPage-savingsPlans:Sparpläne`;

  onSelectDepot(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.portfolioFacade.selectDepot(value === ALL_DEPOTS ? null : (value as DepotId));
  }

  onSort(key: PositionSortKey): void {
    this.portfolioFacade.sortPositions(key);
  }

  onBuy(row: PositionRow): void {
    this.#tradingFacade.clickBuy(row.instrumentId, row.depotId ?? undefined);
  }

  onSell(row: PositionRow): void {
    this.#tradingFacade.clickSell(row.instrumentId, row.depotId ?? undefined);
  }

  onOpenDepot(): void {
    this.portfolioFacade.clickOpenDepot();
  }

  onCreateSavingsPlan(depotId: DepotId | null): void {
    this.#tradingFacade.clickCreateSavingsPlan(undefined, depotId ?? undefined);
  }

  onChangeSavingsPlan(savingsPlanId: SavingsPlanId): void {
    this.#tradingFacade.clickChangeSavingsPlan(savingsPlanId);
  }

  onPauseSavingsPlan({ id, paused }: SavingsPlanPauseChange): void {
    this.#tradingFacade.setSavingsPlanPaused(id, paused);
  }

  onDeleteSavingsPlan(savingsPlanId: SavingsPlanId): void {
    this.#tradingFacade.clickDeleteSavingsPlan(savingsPlanId);
  }
}
