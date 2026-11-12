import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { StatTileComponent } from '@app/shared/ui/stat-tile/stat-tile.component';
import { generateSeed } from '@app/simulation/util/seed-generator';

import {
  SeedFormModel,
  SIMULATION_STEPS,
  SIMULATION_YEAR_STEPS,
  SimulationStep,
  SimulationYearStep,
} from './simulation.page.model';

import { StatisticsStart } from '../../domain/models/lab-statistics.model';
import { MarketStatisticsComponent } from '../../ui/market-statistics/market-statistics.component';
import { SeedComparisonComponent } from '../../ui/seed-comparison/seed-comparison.component';
import { SelfTestComponent } from '../../ui/self-test/self-test.component';
import { SeriesChartComponent } from '../../ui/series-chart/series-chart.component';
import { LabChartOptions } from '../../ui/series-chart/series-chart.model';
import { WorldTablesComponent } from '../../ui/world-tables/world-tables.component';
import { LabFacade } from '../state/lab.facade';

/** Simulation lab (`#/lab/simulation`, TS §14.2): world, simulation in a worker and charts. */
@Component({
  selector: 'app-simulation-page',
  imports: [
    ButtonDirective,
    CommonModule,
    EmptyStateComponent,
    FormatGameTimePipe,
    FormatNumberPipe,
    FormField,
    FormRoot,
    PanelComponent,
    SeriesChartComponent,
    MarketStatisticsComponent,
    SeedComparisonComponent,
    SelfTestComponent,
    WorldTablesComponent,
    SkeletonComponent,
    StatTileComponent,
  ],
  templateUrl: './simulation.page.html',
  host: { class: 'block' },
})
export class SimulationPage {
  labFacade = inject(LabFacade);

  simulationSteps = SIMULATION_STEPS;
  simulationYearSteps = SIMULATION_YEAR_STEPS;

  seedModel = signal<SeedFormModel>({ seed: '' });
  seedForm = form(
    this.seedModel,
    (path) => {
      required(path.seed, {
        message: $localize`:@@featureLab-simulationPage-seedRequired:Bitte gib einen Seed ein.`,
      });
    },
    {
      submission: {
        action: async (field) => this.labFacade.generateWorld(field().value().seed),
      },
    },
  );

  stepLabels: Record<SimulationStep, string> = {
    1: $localize`:@@featureLab-simulationPage-step1:+1 Tag`,
    7: $localize`:@@featureLab-simulationPage-step7:+1 Woche`,
    30: $localize`:@@featureLab-simulationPage-step30:+30 Tage`,
    365: $localize`:@@featureLab-simulationPage-step365:+365 Tage`,
  };
  yearStepLabels: Record<SimulationYearStep, string> = {
    10: $localize`:@@featureLab-simulationPage-step10y:+10 Jahre`,
    50: $localize`:@@featureLab-simulationPage-step50y:+50 Jahre`,
  };

  onRandomSeed(): void {
    const seed = generateSeed(() => crypto.getRandomValues(new Uint32Array(1))[0]);
    this.seedModel.set({ seed });
  }

  onSimulate(days: SimulationStep): void {
    this.labFacade.simulate(days);
  }

  onSimulateYears(years: SimulationYearStep): void {
    this.labFacade.simulateYears(years);
  }

  onComputeStatistics(): void {
    this.labFacade.computeStatistics();
  }

  onChangeStatisticsStart(start: StatisticsStart): void {
    this.labFacade.changeStatisticsStart(start);
  }

  onSelectSeries(series: number): void {
    this.labFacade.selectSeries(series);
  }

  onChangeChartOptions(options: Partial<LabChartOptions>): void {
    this.labFacade.changeChartOptions(options);
  }

  onScrollToChartStart(): void {
    this.labFacade.loadHistory();
  }

  onRunSelfTest(): void {
    this.labFacade.runSelfTest();
  }

  onCompareSeeds(): void {
    this.labFacade.compareSeeds();
  }
}
