import { MAX_STATEMENT_LIMIT } from '@app/banking/domain/models/statement.model';

import {
  StatementFilterState,
  StatementRange,
  StatementState,
  StatementWindowRequest,
} from './banking.model';

/** Rows per page of the statement: the window loads whole pages around the rendered rows. */
export const STATEMENT_PAGE_SIZE = 50;
/** Rows beyond the rendered ones that should already be loaded, so scrolling rarely meets skeletons. */
export const STATEMENT_PREFETCH_ROWS = 10;

export const DEFAULT_STATEMENT_FILTER: StatementFilterState = {
  period: 'all',
  types: [],
  search: '',
};

export const initialStatementState: StatementState = {
  filter: DEFAULT_STATEMENT_FILTER,
  generation: 0,
  total: null,
  offset: 0,
  entries: [],
  range: { start: 0, end: 0 },
  loading: false,
};

/** Whether the filter narrows the statement (then an empty result means „no matches“). */
export function isStatementFilterActive(filter: StatementFilterState): boolean {
  return filter.period !== 'all' || filter.types.length > 0 || filter.search.trim() !== '';
}

/**
 * The window to load for the rendered rows (TS §11.3): `null` while the loaded window covers them
 * with `STATEMENT_PREFETCH_ROWS` to spare, otherwise whole pages from one page before the first
 * rendered row to one page after the last, at most `MAX_STATEMENT_LIMIT` rows. `force` reloads the
 * window even if it covers the rows (new bookings, new query).
 */
export function statementWindowRequest(
  statement: Pick<StatementState, 'total' | 'offset' | 'entries'>,
  range: StatementRange,
  force = false,
): StatementWindowRequest | null {
  const { total, offset, entries } = statement;
  if (!force && total !== null) {
    const neededStart = Math.max(0, range.start - STATEMENT_PREFETCH_ROWS);
    const neededEnd = Math.min(total, range.end + STATEMENT_PREFETCH_ROWS);
    if (neededStart >= offset && neededEnd <= offset + entries.length) {
      return null;
    }
  }
  const start = Math.max(
    0,
    Math.floor(range.start / STATEMENT_PAGE_SIZE) * STATEMENT_PAGE_SIZE - STATEMENT_PAGE_SIZE,
  );
  const end = Math.max(
    start + STATEMENT_PAGE_SIZE,
    Math.ceil(range.end / STATEMENT_PAGE_SIZE) * STATEMENT_PAGE_SIZE + STATEMENT_PAGE_SIZE,
  );
  return { offset: start, limit: Math.min(MAX_STATEMENT_LIMIT, end - start) };
}
