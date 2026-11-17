import { Component, computed, input, output } from '@angular/core';

import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { StatementPeriod } from '@app/banking/domain/models/statement.model';

import { InputDirective } from '@app/shared/ui/input/input.directive';

import { SelectDirective } from '@app/shared/ui/select/select.directive';

import {
  STATEMENT_FILTER_TYPES,
  StatementPeriodOption,
  StatementTypeOption,
} from './statement-filter.model';

import { transactionTypeLabel } from '../labels/banking-labels';

/** Filter of the statement (US-BK-06): period, type and a search over purpose, banks and amounts. */
@Component({
  selector: 'app-statement-filter',
  imports: [SelectDirective, InputDirective],
  templateUrl: './statement-filter.component.html',
  host: { class: 'block' },
})
export class StatementFilterComponent {
  period = input.required<StatementPeriod>();
  types = input.required<TransactionType[]>();
  search = input.required<string>();

  selectedPeriod = output<StatementPeriod>();
  selectedTypes = output<TransactionType[]>();
  enteredSearch = output<string>();

  periodOptions: StatementPeriodOption[] = [
    { id: 'all', label: $localize`:@@uiBanking-statementFilter-periodAll:Alle` },
    {
      id: 'this-month',
      label: $localize`:@@uiBanking-statementFilter-periodThisMonth:Dieser Monat`,
    },
    { id: 'last-month', label: $localize`:@@uiBanking-statementFilter-periodLastMonth:Vormonat` },
    { id: 'this-year', label: $localize`:@@uiBanking-statementFilter-periodThisYear:Dieses Jahr` },
    { id: 'last-year', label: $localize`:@@uiBanking-statementFilter-periodLastYear:Vorjahr` },
  ];
  typeOptions: StatementTypeOption[] = [
    { id: '', label: $localize`:@@uiBanking-statementFilter-typeAll:Alle Buchungsarten` },
    ...STATEMENT_FILTER_TYPES.map((type) => ({ id: type, label: transactionTypeLabel(type) })),
  ];

  /** The filter offers one type at a time; the state could hold several. */
  selectedType = computed(() => (this.types().length === 1 ? this.types()[0] : ''));

  searchPlaceholder = $localize`:@@uiBanking-statementFilter-searchPlaceholder:Zweck, Bank, Kontonummer oder Betrag`;

  onSelectPeriod(event: Event): void {
    this.selectedPeriod.emit((event.target as HTMLSelectElement).value as StatementPeriod);
  }

  onSelectType(event: Event): void {
    const type = (event.target as HTMLSelectElement).value as TransactionType | '';
    this.selectedTypes.emit(type === '' ? [] : [type]);
  }

  onSearch(event: Event): void {
    this.enteredSearch.emit((event.target as HTMLInputElement).value);
  }
}
