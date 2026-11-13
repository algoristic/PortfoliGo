/** Text of a statement entry (TS §8.6): the booking text and an optional second line. */
export interface StatementEntryText {
  text: string;
  detail: string | null;
}

/** A loaded row of the statement list, formatted once when its page arrives. */
export interface StatementRowView extends StatementEntryText {
  seq: number;
  /** Position in the list, from 1 (`aria-posinset`). */
  position: number;
  date: string;
  amount: string;
  amountClass: string;
  balance: string;
}

/** A row of the list: loaded, or `null` while its page is not loaded (skeleton). */
export type StatementRow = StatementRowView | null;

/** Rows of the list from `start` (inclusive) to `end` (exclusive) that the viewport shows. */
export interface StatementListRange {
  start: number;
  end: number;
}
