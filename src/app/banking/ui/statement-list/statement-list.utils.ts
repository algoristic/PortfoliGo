import { StatementEntry } from '@app/banking/domain/models/statement.model';
import { formatGameDate } from '@app/clock/domain/game-time-format';
import { changeDirection } from '@app/shared/util/change-direction';
import { formatCents, formatSignedCents } from '@app/shared/util/format';

import { StatementRow, StatementRowView } from './statement-list.model';
import { InstrumentNames, statementEntryText } from './statement-text.utils';

const AMOUNT_CLASSES = { up: 'text-up', down: 'text-down', flat: 'text-fg-muted' } as const;

/**
 * Rows of the statement list (TS §11.3): `total` rows, the loaded window from `offset` as views,
 * every other row `null` (skeleton). Only the window is formatted, so a page costs the same at 50
 * and at 10,000 bookings apart from the array of rows (TS §14.3).
 */
export function statementRows(
  total: number,
  offset: number,
  entries: readonly StatementEntry[],
  bankNames: ReadonlyMap<string, string>,
  instrumentNames?: InstrumentNames,
): StatementRow[] {
  const rows: StatementRow[] = new Array<StatementRow>(total).fill(null);
  const end = Math.min(total, offset + entries.length);
  for (let index = Math.max(0, offset); index < end; index++) {
    rows[index] = statementRowView(entries[index - offset], index, bankNames, instrumentNames);
  }
  return rows;
}

function statementRowView(
  entry: StatementEntry,
  index: number,
  bankNames: ReadonlyMap<string, string>,
  instrumentNames: InstrumentNames | undefined,
): StatementRowView {
  return {
    ...statementEntryText(entry, bankNames, instrumentNames),
    seq: entry.seq,
    position: index + 1,
    date: formatGameDate(entry.tick),
    amount: formatSignedCents(entry.amount),
    amountClass: AMOUNT_CLASSES[changeDirection(entry.amount)],
    balance: formatCents(entry.balanceAfter),
  };
}
