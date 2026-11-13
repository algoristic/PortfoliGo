import {
  CurrentAccountConditions,
  CustodyFee,
  DepotConditions,
  FeeModel,
  SavingsAccountConditions,
} from '@app/banking/domain/models/bank-conditions.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { formatCents, formatNumber, formatPercent, MISSING_VALUE } from '@app/shared/util/format';

import { interestPayoutLabel, tradingVenueLabel } from './banking-labels';

// Conditions of a bank in words (US-BK-01, PS §10.1 „Kosten vor Aktion“): pure formatting of the
// world's conditions for the bank comparison and the dialogs.

/** A fee model, e.g. `4,90 € + 0,25 %, max. 69,90 €` or `kostenlos`. */
export function feeModelText(model: FeeModel): string {
  switch (model.kind) {
    case 'free':
      return $localize`:@@uiBanking-bankConditionsText-free:kostenlos`;
    case 'flat':
      return formatCents(model.amount);
    case 'percent':
      return withBounds(formatPercent(model.rate), model.min, model.max);
    case 'flat-plus-percent':
      return withBounds(
        `${formatCents(model.amount)} + ${formatPercent(model.rate)}`,
        model.min,
        model.max,
      );
    case 'tiered':
      return model.tiers
        .map(({ upToVolume, fee }) =>
          upToVolume === null
            ? $localize`:@@uiBanking-bankConditionsText-tierAbove:darüber ${feeModelText(fee)}:fee:`
            : $localize`:@@uiBanking-bankConditionsText-tierUpTo:bis ${formatCents(upToVolume)}:volume: ${feeModelText(fee)}:fee:`,
        )
        .join('; ');
  }
}

/** Account fee with its waiver, e.g. `0,00 € ab 700,00 € Geldeingang, sonst 5,40 € im Monat`. */
export function accountFeeText(current: CurrentAccountConditions | null): string {
  if (current === null) {
    return MISSING_VALUE;
  }
  const monthly = formatCents(current.monthlyFee);
  if (current.monthlyFee === 0) {
    return $localize`:@@uiBanking-bankConditionsText-accountFeeFree:kostenlos`;
  }
  if (current.feeWaiver) {
    const deposits = formatCents(current.feeWaiver.minMonthlyDeposits);
    return $localize`:@@uiBanking-bankConditionsText-accountFeeWaiver:0,00 € ab ${deposits}:deposits: Geldeingang, sonst ${monthly}:fee: im Monat`;
  }
  return $localize`:@@uiBanking-bankConditionsText-accountFeeMonthly:${monthly}:fee: im Monat`;
}

/** Overdraft rate and the surcharge above the limit, e.g. `9,45 %, Aufschlag 4,50 Pp.`. */
export function overdraftText(current: CurrentAccountConditions | null): string {
  if (current === null) {
    return MISSING_VALUE;
  }
  const { rate, toleratedSurcharge } = current.overdraft;
  const surcharge = formatNumber(toleratedSurcharge * 100, 2);
  return $localize`:@@uiBanking-bankConditionsText-overdraft:${formatPercent(rate)}:rate:, Aufschlag ${surcharge}:surcharge: Pp.`;
}

/** Savings rate with its payout, e.g. `2,30 %, quartalsweise`. */
export function savingsText(savings: SavingsAccountConditions | null): string {
  return savings === null
    ? MISSING_VALUE
    : `${formatPercent(savings.rate)}, ${interestPayoutLabel(savings.payout)}`;
}

/** Credit and debit rate of the clearing account, e.g. `Haben 1,15 % · Soll 8,45 %`. */
export function clearingText(depot: DepotConditions): string {
  const credit = formatPercent(depot.clearingAccountRate);
  const debit = formatPercent(depot.clearingAccountDebitRate);
  return $localize`:@@uiBanking-bankConditionsText-clearing:Haben ${credit}:credit: · Soll ${debit}:debit:`;
}

/** Custody fee per year, e.g. `0,19 % p. a., mind. 28,10 €` or `kostenlos`. */
export function custodyFeeText(custody: CustodyFee): string {
  switch (custody.kind) {
    case 'none':
      return $localize`:@@uiBanking-bankConditionsText-custodyFree:kostenlos`;
    case 'percent-pa':
      return withBounds(
        $localize`:@@uiBanking-bankConditionsText-custodyPercent:${formatPercent(custody.rate)}:rate: p. a.`,
        custody.min,
        custody.max,
      );
    case 'flat-pa':
      return $localize`:@@uiBanking-bankConditionsText-custodyFlat:${formatCents(custody.amount)}:amount: p. a.`;
  }
}

/** Order fee plus the exchange fee, e.g. `0,25 %, mind. 10,00 €, max. 60,00 € + 3,00 € Börsenentgelt`. */
export function orderFeeText(depot: DepotConditions): string {
  const orderFee = feeModelText(depot.orderFee);
  return depot.exchangeFee > 0
    ? $localize`:@@uiBanking-bankConditionsText-orderFeeWithExchangeFee:${orderFee}:orderFee: + ${formatCents(depot.exchangeFee)}:exchangeFee: Börsenentgelt`
    : orderFee;
}

/** Cost of a savings plan execution, e.g. `1,20 %` or `kostenlos`. */
export function savingsPlanText(depot: DepotConditions): string {
  return feeModelText(depot.savingsPlanFee);
}

/** Trading venue, with the spread mark-up of a market maker, e.g. `Market Maker, Spread-Aufschlag 0,12 %`. */
export function venueText(depot: DepotConditions): string {
  const venue = tradingVenueLabel(depot.venue);
  return depot.venue === 'market-maker'
    ? $localize`:@@uiBanking-bankConditionsText-venueWithMarkup:${venue}:venue:, Spread-Aufschlag ${formatPercent(depot.spreadMarkup)}:markup:`
    : venue;
}

export function fractionalSharesText(depot: DepotConditions): string {
  return depot.fractionalShares
    ? $localize`:@@uiBanking-bankConditionsText-fractionalYes:ja`
    : $localize`:@@uiBanking-bankConditionsText-fractionalNo:nein`;
}

function withBounds(text: string, min: Cents | undefined, max: Cents | undefined): string {
  let result = text;
  if (min !== undefined) {
    result += $localize`:@@uiBanking-bankConditionsText-min:, mind. ${formatCents(min)}:amount:`;
  }
  if (max !== undefined) {
    result += $localize`:@@uiBanking-bankConditionsText-max:, max. ${formatCents(max)}:amount:`;
  }
  return result;
}
