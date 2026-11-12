import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import * as LabActions from './lab.actions';

import * as LabSelectors from './lab.selectors';

import { StatisticsStart } from '../../domain/models/lab-statistics.model';
import { LabChartOptions } from '../../ui/series-chart/series-chart.model';

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
  loadingHistory$ = this.#store.pipe(select(LabSelectors.selectLoadingHistory));
  statisticsStart$ = this.#store.pipe(select(LabSelectors.selectStatisticsStart));
  statistics$ = this.#store.pipe(select(LabSelectors.selectStatistics));
  loadingStatistics$ = this.#store.pipe(select(LabSelectors.selectLoadingStatistics));
  selfTest$ = this.#store.pipe(select(LabSelectors.selectSelfTest));
  runningSelfTest$ = this.#store.pipe(select(LabSelectors.selectRunningSelfTest));

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

  simulateYears(years: number): void {
    this.#store.dispatch(LabActions.clickedSimulateYears({ years }));
  }

  computeStatistics(): void {
    this.#store.dispatch(LabActions.clickedComputeStatistics());
  }

  changeStatisticsStart(start: StatisticsStart): void {
    this.#store.dispatch(LabActions.changedStatisticsStart({ start }));
  }

  selectSeries(series: number): void {
    this.#store.dispatch(LabActions.selectedSeries({ series }));
  }

  changeChartOptions(options: Partial<LabChartOptions>): void {
    this.#store.dispatch(LabActions.changedChartOptions({ options }));
  }

  loadHistory(): void {
    this.#store.dispatch(LabActions.scrolledToChartStart());
  }

  runSelfTest(): void {
    this.#store.dispatch(LabActions.clickedRunSelfTest());
  }
}
