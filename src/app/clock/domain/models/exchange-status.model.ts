import { Tick } from './time.model';

/** Whether an exchange or a region trades now and when that changes next (TS §3.3). */
export interface ExchangeStatus {
  open: boolean;
  /** While open the next closing, otherwise the next opening. */
  changesAt: Tick;
}
