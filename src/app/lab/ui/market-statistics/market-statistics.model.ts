import { TargetRow } from '../../domain/models/lab-statistics.model';

/** Calibration target as shown in the table: label, measured value and target range as text. */
export interface TargetRowView extends TargetRow {
  label: string;
  valueText: string;
  targetText: string;
}
