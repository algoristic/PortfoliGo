import { Component, computed, input, output } from '@angular/core';

import {
  BankComparisonKey,
  BankSort,
  EXAMPLE_ORDER_VOLUMES,
  orderCost,
} from '@app/banking/domain/bank-comparison-logic';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { TableCellDirective } from '@app/shared/ui/table/table-cell.directive';
import { TableScrollDirective } from '@app/shared/ui/table/table-scroll.directive';
import { TableDirective } from '@app/shared/ui/table/table.directive';
import { formatCents } from '@app/shared/util/format';
import { Bank } from '@app/world/domain/models/bank.model';

import {
  BANK_TABLE_COLUMNS,
  BankTableColumn,
  BankTableColumnId,
  BankTableRow,
} from './bank-table.model';

import {
  accountFeeText,
  clearingText,
  custodyFeeText,
  fractionalSharesText,
  orderFeeText,
  overdraftText,
  savingsPlanText,
  savingsText,
  venueText,
} from '../labels/bank-conditions-text';
import { bankTypeLabel } from '../labels/banking-labels';

const TEXT_CELL = 'min-w-40';
const AMOUNT_CELL = 'text-right whitespace-nowrap tabular-nums';
const SHORT_CELL = 'whitespace-nowrap';

const COLUMN_SORT_KEYS: Record<BankTableColumnId, BankComparisonKey | null> = {
  'account-fee': 'accountFee',
  overdraft: 'overdraftRate',
  savings: 'savingsRate',
  clearing: null,
  'custody-fee': 'custodyFee',
  'order-fee': null,
  'order-1000': 'orderCost1000',
  'order-5000': 'orderCost5000',
  'savings-plan': null,
  venue: null,
  fractional: null,
};

const COLUMN_CLASSES: Record<BankTableColumnId, string> = {
  'account-fee': TEXT_CELL,
  overdraft: TEXT_CELL,
  savings: TEXT_CELL,
  clearing: TEXT_CELL,
  'custody-fee': TEXT_CELL,
  'order-fee': TEXT_CELL,
  'order-1000': AMOUNT_CELL,
  'order-5000': AMOUNT_CELL,
  'savings-plan': SHORT_CELL,
  venue: TEXT_CELL,
  fractional: SHORT_CELL,
};

/**
 * The banks of the world with their conditions (US-BK-01, AP 3.5): conditions in words, the cost of
 * two example orders, sortable columns (`aria-sort`, buttons in the headers) and „Konto eröffnen“
 * per bank. The table scrolls in its own container on narrow screens.
 */
@Component({
  selector: 'app-bank-table',
  imports: [
    TableScrollDirective,
    TableCellDirective,
    TableDirective,
    CardDirective,
    ButtonDirective,
    IconDirective,
  ],
  templateUrl: './bank-table.component.html',
  host: { class: 'block' },
})
export class BankTableComponent {
  banks = input.required<Bank[]>();
  sort = input<BankSort | null>(null);

  selectedSort = output<BankComparisonKey>();
  clickedOpenAccount = output<string>();

  columns = computed((): BankTableColumn[] => {
    const sort = this.sort();
    return BANK_TABLE_COLUMNS.map((id) => {
      const sortKey = COLUMN_SORT_KEYS[id];
      const ariaSort = sortKey !== null && sort?.key === sortKey ? sort.direction : 'none';
      return {
        id,
        label: columnLabel(id),
        sortKey,
        ariaSort,
        sortIcon:
          ariaSort === 'ascending'
            ? 'arrow-up'
            : ariaSort === 'descending'
              ? 'arrow-down'
              : 'arrow-down-up',
        sortIconClass: ariaSort === 'none' ? 'text-xs text-fg-muted' : 'text-xs text-accent',
        cellClass: COLUMN_CLASSES[id],
      };
    });
  });

  rows = computed((): BankTableRow[] =>
    this.banks().map((bank) => {
      const values = cellValues(bank);
      return {
        id: bank.id,
        name: bank.name,
        type: bankTypeLabel(bank.type),
        openAccountLabel: $localize`:@@uiBanking-bankTable-openAccountLabel:Konto eröffnen bei ${bank.name}:bank:`,
        cells: BANK_TABLE_COLUMNS.map((id) => ({
          id,
          value: values[id],
          cellClass: COLUMN_CLASSES[id],
        })),
      };
    }),
  );

  label = $localize`:@@uiBanking-bankTable-label:Banken und Konditionen`;

  onSort(key: BankComparisonKey | null): void {
    if (key !== null) {
      this.selectedSort.emit(key);
    }
  }

  onOpenAccount(bankId: string): void {
    this.clickedOpenAccount.emit(bankId);
  }
}

function cellValues(bank: Bank): Record<BankTableColumnId, string> {
  const { currentAccount, savingsAccount, depot } = bank.conditions;
  return {
    'account-fee': accountFeeText(currentAccount),
    overdraft: overdraftText(currentAccount),
    savings: savingsText(savingsAccount),
    clearing: clearingText(depot),
    'custody-fee': custodyFeeText(depot.custodyFee),
    'order-fee': orderFeeText(depot),
    'order-1000': formatCents(orderCost(depot, EXAMPLE_ORDER_VOLUMES.orderCost1000)),
    'order-5000': formatCents(orderCost(depot, EXAMPLE_ORDER_VOLUMES.orderCost5000)),
    'savings-plan': savingsPlanText(depot),
    venue: venueText(depot),
    fractional: fractionalSharesText(depot),
  };
}

function columnLabel(id: BankTableColumnId): string {
  switch (id) {
    case 'account-fee':
      return $localize`:@@uiBanking-bankTable-accountFee:Kontoführung`;
    case 'overdraft':
      return $localize`:@@uiBanking-bankTable-overdraft:Dispozins`;
    case 'savings':
      return $localize`:@@uiBanking-bankTable-savings:Tagesgeld`;
    case 'clearing':
      return $localize`:@@uiBanking-bankTable-clearing:Verrechnungskonto`;
    case 'custody-fee':
      return $localize`:@@uiBanking-bankTable-custodyFee:Depotgebühr`;
    case 'order-fee':
      return $localize`:@@uiBanking-bankTable-orderFee:Orderentgelt`;
    case 'order-1000':
      return $localize`:@@uiBanking-bankTable-order1000:Order 1.000 €`;
    case 'order-5000':
      return $localize`:@@uiBanking-bankTable-order5000:Order 5.000 €`;
    case 'savings-plan':
      return $localize`:@@uiBanking-bankTable-savingsPlan:Sparplan`;
    case 'venue':
      return $localize`:@@uiBanking-bankTable-venue:Handelsplatz`;
    case 'fractional':
      return $localize`:@@uiBanking-bankTable-fractional:Bruchstücke`;
  }
}
