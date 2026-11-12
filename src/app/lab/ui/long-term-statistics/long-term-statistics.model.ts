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
}
