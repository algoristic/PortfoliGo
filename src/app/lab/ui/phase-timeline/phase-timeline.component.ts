import { Component, computed, input } from '@angular/core';

import { formatGameDate } from '@app/clock/domain/game-time-format';
import { MarketPhase } from '@app/market/domain/models/market-config.model';
import { FormatPercentPipe } from '@app/shared/ui/pipes/format-percent/format-percent.pipe';

import { PhaseSegmentView } from './phase-timeline.model';

import { PhaseSegment, PhaseShare } from '../../domain/models/lab-statistics.model';

const PHASE_CLASSES: Record<MarketPhase, string> = {
  boom: 'bg-up',
  normal: 'bg-accent',
  downturn: 'bg-warning',
  crisis: 'bg-down',
};

/** Market phases over the period as a proportional bar, with the share of time per phase. */
@Component({
  selector: 'app-phase-timeline',
  imports: [FormatPercentPipe],
  templateUrl: './phase-timeline.component.html',
  host: { class: 'block' },
})
export class PhaseTimelineComponent {
  segments = input.required<PhaseSegment[]>();
  shares = input.required<PhaseShare[]>();

  phaseClasses = PHASE_CLASSES;

  marketDays = computed(() =>
    this.segments().reduce((sum, segment) => sum + segment.marketDays, 0),
  );
  segmentViews = computed<PhaseSegmentView[]>(() =>
    this.segments().map((segment) => ({
      ...segment,
      title: `${this.phaseLabels[segment.phase]}: ${formatGameDate(segment.fromTick)} – ${formatGameDate(segment.toTick)}`,
    })),
  );

  phaseLabels: Record<MarketPhase, string> = {
    boom: $localize`:@@uiLab-phaseTimeline-boom:Aufschwung`,
    normal: $localize`:@@uiLab-phaseTimeline-normal:Normal`,
    downturn: $localize`:@@uiLab-phaseTimeline-downturn:Abschwung`,
    crisis: $localize`:@@uiLab-phaseTimeline-crisis:Krise`,
  };
}
