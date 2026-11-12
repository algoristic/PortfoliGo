import { PhaseSegment } from '../../domain/models/lab-statistics.model';

export interface PhaseSegmentView extends PhaseSegment {
  /** Tooltip: phase and period. */
  title: string;
}
