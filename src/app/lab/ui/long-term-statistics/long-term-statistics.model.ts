import { Tick } from '@app/clock/domain/models/time.model';

export interface CheckpointColumn {
  years: number;
  tick: Tick | null;
}

/** One measure of the checkpoint table: a text per checkpoint, in the order of the columns. */
export interface CheckpointRowView {
  id: string;
  label: string;
  values: { years: number; text: string }[];
  /** Limit at the checkpoints of E-22, e.g. „≤ 10,0 %“ or one per checkpoint; `–` without a limit. */
  limit: string;
}

/** One measure of the rolling windows of one length. */
export interface WindowRowView {
  id: string;
  years: number;
  label: string;
  count: number;
  min: string;
  median: string;
  max: string;
  /** Limit of the median (E-22); `–` without a limit. */
  limit: string;
}
