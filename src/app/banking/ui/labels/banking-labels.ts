import { AccountKind, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import {
  BankType,
  InterestPayout,
  TradingVenue,
} from '@app/banking/domain/models/bank-conditions.model';
import { TransactionType } from '@app/banking/domain/models/ledger.model';

/** Names of the account kinds (US-BK-02). */
export function accountKindLabel(kind: AccountKind): string {
  switch (kind) {
    case 'current':
      return $localize`:@@uiBanking-bankingLabels-current:Girokonto`;
    case 'savings':
      return $localize`:@@uiBanking-bankingLabels-savings:Tagesgeld`;
    case 'clearing':
      return $localize`:@@uiBanking-bankingLabels-clearing:Verrechnungskonto`;
  }
}

/** An account as the player tells it apart, e.g. `Girokonto 0000000001 · Isane Bank`. */
export function accountTitle(
  account: { kind: AccountKind; number: string },
  bankName: string | null | undefined,
): string {
  const title = `${accountKindLabel(account.kind)} ${account.number}`;
  return bankName ? `${title} · ${bankName}` : title;
}

/** What a player can open (US-BK-02); a depot comes with its clearing account. */
export function openableAccountKindLabel(kind: OpenableAccountKind): string {
  switch (kind) {
    case 'current':
      return $localize`:@@uiBanking-bankingLabels-openCurrent:Girokonto`;
    case 'savings':
      return $localize`:@@uiBanking-bankingLabels-openSavings:Tagesgeldkonto`;
    case 'depot':
      return $localize`:@@uiBanking-bankingLabels-openDepot:Depot mit Verrechnungskonto`;
  }
}

/** Names of the bank types (US-BK-01, TS §5.7). */
export function bankTypeLabel(type: BankType): string {
  switch (type) {
    case 'branch':
      return $localize`:@@uiBanking-bankingLabels-branch:Filialbank`;
    case 'direct':
      return $localize`:@@uiBanking-bankingLabels-direct:Direktbank`;
    case 'online-broker':
      return $localize`:@@uiBanking-bankingLabels-onlineBroker:Onlinebroker`;
    case 'neo-broker':
      return $localize`:@@uiBanking-bankingLabels-neoBroker:Neobroker`;
  }
}

export function interestPayoutLabel(payout: InterestPayout): string {
  switch (payout) {
    case 'monthly':
      return $localize`:@@uiBanking-bankingLabels-monthly:monatlich`;
    case 'quarterly':
      return $localize`:@@uiBanking-bankingLabels-quarterly:quartalsweise`;
  }
}

export function tradingVenueLabel(venue: TradingVenue): string {
  switch (venue) {
    case 'exchange':
      return $localize`:@@uiBanking-bankingLabels-exchange:Börse`;
    case 'market-maker':
      return $localize`:@@uiBanking-bankingLabels-marketMaker:Market Maker`;
  }
}

/** Names of the transaction types (TS §7.2), e.g. for the type filter of the statement. */
export function transactionTypeLabel(type: TransactionType): string {
  switch (type) {
    case 'opening-balance':
      return $localize`:@@uiBanking-bankingLabels-openingBalance:Startkapital`;
    case 'salary':
      return $localize`:@@uiBanking-bankingLabels-salary:Gehalt`;
    case 'living-costs':
      return $localize`:@@uiBanking-bankingLabels-livingCosts:Lebenshaltung`;
    case 'account-fee':
      return $localize`:@@uiBanking-bankingLabels-accountFee:Kontoführung`;
    case 'custody-fee':
      return $localize`:@@uiBanking-bankingLabels-custodyFee:Depotgebühr`;
    case 'overdraft-interest':
      return $localize`:@@uiBanking-bankingLabels-overdraftInterest:Dispozinsen`;
    case 'debit-interest':
      return $localize`:@@uiBanking-bankingLabels-debitInterest:Sollzinsen`;
    case 'credit-interest':
      return $localize`:@@uiBanking-bankingLabels-creditInterest:Habenzinsen`;
    case 'transfer':
      return $localize`:@@uiBanking-bankingLabels-transfer:Überweisung`;
    case 'buy':
      return $localize`:@@uiBanking-bankingLabels-buy:Kauf`;
    case 'sell':
      return $localize`:@@uiBanking-bankingLabels-sell:Verkauf`;
    case 'dividend':
      return $localize`:@@uiBanking-bankingLabels-dividend:Dividende`;
    case 'fund-distribution':
      return $localize`:@@uiBanking-bankingLabels-fundDistribution:Ausschüttung`;
    case 'tax':
      return $localize`:@@uiBanking-bankingLabels-tax:Abgeltungsteuer`;
    case 'tax-refund':
      return $localize`:@@uiBanking-bankingLabels-taxRefund:Steuererstattung`;
  }
}
