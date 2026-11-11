import { Component, computed, input } from '@angular/core';

import { formatGameDate } from '../../../clock/domain/game-time-format';
import { MarketPhase } from '../../../market/domain/models/market-config.model';
import { formatPercent } from '../../../shared/util/format';
import { PhaseSegment, PhaseShare } from '../../domain/models/lab-statistics.model';

const PHASE_CLASSES: Record<MarketPhase, string> = {
  boom: 'bg-up',
  normal: 'bg-accent',
  downturn: 'bg-warning',
  crisis: 'bg-down',
};

/** Market phases over the period as a proportional bar, with the share of time per phase. */
@Component({
  selector: 'app-section-phase-timeline',
  imports: [],
  templateUrl: './section-phase-timeline.component.html',
  styleUrl: './section-phase-timeline.component.scss',
})
export class SectionPhaseTimelineComponent {
  segments = input.required<PhaseSegment[]>();
  shares = input.required<PhaseShare[]>();

  phaseClasses = PHASE_CLASSES;

  marketDays = computed(() =>
    this.segments().reduce((sum, segment) => sum + segment.marketDays, 0),
  );

  phaseLabels: Record<MarketPhase, string> = {
    boom: $localize`:@@uiLab-sectionPhaseTimeline-boom:Aufschwung`,
    normal: $localize`:@@uiLab-sectionPhaseTimeline-normal:Normal`,
    downturn: $localize`:@@uiLab-sectionPhaseTimeline-downturn:Abschwung`,
    crisis: $localize`:@@uiLab-sectionPhaseTimeline-crisis:Krise`,
  };

  segmentTitle(segment: PhaseSegment): string {
    return `${this.phaseLabels[segment.phase]}: ${formatGameDate(segment.fromTick)} – ${formatGameDate(segment.toTick)}`;
  }

  formatShare(share: number): string {
    return formatPercent(share, 1);
  }
}
