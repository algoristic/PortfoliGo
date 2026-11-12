import { Tick } from '@app/clock/domain/models/time.model';

/** Targets of a jump (PS US-ZT-05, TS §3.7). */
export type JumpTarget =
  | { kind: 'next-open' }
  | { kind: 'next-month' }
  /** Any minute after now, at most one calendar year ahead. */
  | { kind: 'date'; tick: Tick };

export const JUMP_TARGET_KINDS = ['next-open', 'next-month', 'date'] as const;
export type JumpTargetKind = (typeof JUMP_TARGET_KINDS)[number];
