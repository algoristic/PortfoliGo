import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import * as LabActions from './lab.actions';
import { LabChartOptions } from './lab.model';
import * as LabSelectors from './lab.selectors';

@Injectable()
export class LabFacade {
  readonly #store = inject(Store);

  status$ = this.#store.pipe(select(LabSelectors.selectStatus));
  busy$ = this.#store.pipe(select(LabSelectors.selectBusy));
  seed$ = this.#store.pipe(select(LabSelectors.selectSeed));
  overview$ = this.#store.pipe(select(LabSelectors.selectOverview));
  now$ = this.#store.pipe(select(LabSelectors.selectNow));
  simulatedDays$ = this.#store.pipe(select(LabSelectors.selectSimulatedDays));
  timings$ = this.#store.pipe(select(LabSelectors.selectTimings));
  seriesOptions$ = this.#store.pipe(select(LabSelectors.selectSeriesOptions));
  selectedSeries$ = this.#store.pipe(select(LabSelectors.selectSelectedSeries));
  selectedSeriesOption$ = this.#store.pipe(select(LabSelectors.selectSelectedSeriesOption));
  chartOptions$ = this.#store.pipe(select(LabSelectors.selectChartOptions));
  allowedResolutions$ = this.#store.pipe(select(LabSelectors.selectAllowedResolutions));
  candles$ = this.#store.pipe(select(LabSelectors.selectCandles));
  loadingCandles$ = this.#store.pipe(select(LabSelectors.selectLoadingCandles));

  enterSimulationPage(): void {
    this.#store.dispatch(LabActions.enterSimulationPage());
  }

  leaveSimulationPage(): void {
    this.#store.dispatch(LabActions.leaveSimulationPage());
  }

  generateWorld(seed: string): void {
    this.#store.dispatch(LabActions.submittedSeed({ seed }));
  }

  simulate(days: number): void {
    this.#store.dispatch(LabActions.clickedSimulate({ days }));
  }

  selectSeries(series: number): void {
    this.#store.dispatch(LabActions.selectedSeries({ series }));
  }

  changeChartOptions(options: Partial<LabChartOptions>): void {
    this.#store.dispatch(LabActions.changedChartOptions({ options }));
  }
}
