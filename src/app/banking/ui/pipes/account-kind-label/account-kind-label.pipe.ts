import { Pipe, PipeTransform } from '@angular/core';

import { AccountKind } from '@app/banking/domain/models/account.model';

import { accountKindLabel } from '../../labels/banking-labels';

/** Name of an account kind, e.g. `current` → `Girokonto`. */
@Pipe({ name: 'accountKindLabel' })
export class AccountKindLabelPipe implements PipeTransform {
  transform(kind: AccountKind): string {
    return accountKindLabel(kind);
  }
}
