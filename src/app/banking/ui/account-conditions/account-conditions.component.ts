import { Component, computed, input } from '@angular/core';

import { OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { BankConditions } from '@app/banking/domain/models/bank-conditions.model';
import { formatNumber, formatPercent } from '@app/shared/util/format';

import {
  accountFeeText,
  clearingText,
  custodyFeeText,
  fractionalSharesText,
  orderFeeText,
  overdraftText,
  savingsPlanText,
  venueText,
} from '../labels/bank-conditions-text';
import { interestPayoutLabel } from '../labels/banking-labels';

interface ConditionItem {
  id: string;
  label: string;
  value: string;
}

/**
 * The conditions that matter for an account kind at a bank (PS §10.1 „Kosten vor Aktion“): shown
 * before an account is opened. Nothing for a kind the bank does not offer.
 */
@Component({
  selector: 'app-account-conditions',
  templateUrl: './account-conditions.component.html',
  host: { class: 'block' },
})
export class AccountConditionsComponent {
  conditions = input.required<BankConditions>();
  kind = input<OpenableAccountKind | null>(null);
  testId = input('account-conditions');

  items = computed((): ConditionItem[] => {
    const { currentAccount, savingsAccount, depot } = this.conditions();
    switch (this.kind()) {
      case 'current':
        return currentAccount === null
          ? []
          : [
              {
                id: 'account-fee',
                label: $localize`:@@uiBanking-accountConditions-accountFee:Kontoführung`,
                value: accountFeeText(currentAccount),
              },
              {
                id: 'overdraft-rate',
                label: $localize`:@@uiBanking-accountConditions-overdraftRate:Dispozins`,
                value: overdraftText(currentAccount),
              },
              {
                id: 'overdraft-limit',
                label: $localize`:@@uiBanking-accountConditions-overdraftLimit:Dispo-Rahmen`,
                value: $localize`:@@uiBanking-accountConditions-overdraftLimitValue:${formatNumber(currentAccount.overdraft.limitIncomeFactor)}:factor: × durchschnittlicher Gehaltseingang der letzten drei Monate bei dieser Bank`,
              },
            ];
      case 'savings':
        return savingsAccount === null
          ? []
          : [
              {
                id: 'savings-rate',
                label: $localize`:@@uiBanking-accountConditions-savingsRate:Zinssatz`,
                value: formatPercent(savingsAccount.rate),
              },
              {
                id: 'payout',
                label: $localize`:@@uiBanking-accountConditions-payout:Zinsgutschrift`,
                value: interestPayoutLabel(savingsAccount.payout),
              },
            ];
      case 'depot':
        return [
          {
            id: 'custody-fee',
            label: $localize`:@@uiBanking-accountConditions-custodyFee:Depotgebühr`,
            value: custodyFeeText(depot.custodyFee),
          },
          {
            id: 'order-fee',
            label: $localize`:@@uiBanking-accountConditions-orderFee:Orderentgelt`,
            value: orderFeeText(depot),
          },
          {
            id: 'savings-plan',
            label: $localize`:@@uiBanking-accountConditions-savingsPlan:Sparplan je Ausführung`,
            value: savingsPlanText(depot),
          },
          {
            id: 'clearing',
            label: $localize`:@@uiBanking-accountConditions-clearing:Verrechnungskonto`,
            value: clearingText(depot),
          },
          {
            id: 'venue',
            label: $localize`:@@uiBanking-accountConditions-venue:Handelsplatz`,
            value: venueText(depot),
          },
          {
            id: 'fractional',
            label: $localize`:@@uiBanking-accountConditions-fractional:Bruchstückhandel`,
            value: fractionalSharesText(depot),
          },
        ];
      default:
        return [];
    }
  });
}
