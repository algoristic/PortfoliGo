import { Component, computed, input } from '@angular/core';

import { AccountKind } from '@app/banking/domain/models/account.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { StatTileComponent } from '@app/shared/ui/stat-tile/stat-tile.component';
import { formatCents } from '@app/shared/util/format';

interface TotalTile {
  id: AccountKind | 'total';
  label: string;
  value: string;
}

/** Balances of the open accounts per kind and in total (AP 3.4, TS §7.9). */
@Component({
  selector: 'app-account-totals',
  imports: [StatTileComponent],
  templateUrl: './account-totals.component.html',
  host: { class: 'block' },
})
export class AccountTotalsComponent {
  byKind = input.required<Record<AccountKind, Cents>>();
  total = input.required<Cents>();

  tiles = computed((): TotalTile[] => [
    {
      id: 'total',
      label: $localize`:@@uiBanking-accountTotals-total:Gesamt`,
      value: formatCents(this.total()),
    },
    {
      id: 'current',
      label: $localize`:@@uiBanking-accountTotals-current:Girokonten`,
      value: formatCents(this.byKind().current),
    },
    {
      id: 'savings',
      label: $localize`:@@uiBanking-accountTotals-savings:Tagesgeld`,
      value: formatCents(this.byKind().savings),
    },
    {
      id: 'clearing',
      label: $localize`:@@uiBanking-accountTotals-clearing:Verrechnungskonten`,
      value: formatCents(this.byKind().clearing),
    },
  ]);
}
