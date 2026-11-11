import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';

import { SeedFormModel, SIMULATION_STEPS, SimulationStep } from './simulation.page.model';

import { formatGameTime } from '../../../clock/domain/game-time-format';
import { Tick } from '../../../clock/domain/models/time.model';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { StatTileComponent } from '../../../shared/ui/stat-tile/stat-tile.component';
import { formatNumber } from '../../../shared/util/format';
import { generateSeed } from '../../../simulation/util/seed-generator';
import { SectionSeriesChartComponent } from '../section-series-chart/section-series-chart.component';
import { SectionWorldTablesComponent } from '../section-world-tables/section-world-tables.component';
import { LabFacade } from '../state/lab.facade';
import { LabChartOptions } from '../state/lab.model';

/** Simulation lab (`#/lab/simulation`, TS §14.2): world, simulation in a worker and charts. */
@Component({
  selector: 'app-simulation',
  imports: [
    ButtonDirective,
    CommonModule,
    EmptyStateComponent,
    FormField,
    FormRoot,
    PanelComponent,
    SectionSeriesChartComponent,
    SectionWorldTablesComponent,
    SkeletonComponent,
    StatTileComponent,
  ],
  templateUrl: './simulation.page.html',
  styleUrl: './simulation.page.scss',
})
export class SimulationPage {
  labFacade = inject(LabFacade);

  simulationSteps = SIMULATION_STEPS;

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

  onRandomSeed(): void {
    const seed = generateSeed(() => crypto.getRandomValues(new Uint32Array(1))[0]);
    this.seedModel.set({ seed });
  }

  onSimulate(days: SimulationStep): void {
    this.labFacade.simulate(days);
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

  formatTime(tick: Tick): string {
    return formatGameTime(tick);
  }

  formatDays(days: number | null): string {
    return formatNumber(days ?? 0);
  }

  formatMs(ms: number | undefined): string {
    return ms === undefined ? '–' : `${formatNumber(ms)} ms`;
  }

  formatRate(rate: number | undefined): string {
    return rate === undefined ? '–' : formatNumber(rate);
  }
}
