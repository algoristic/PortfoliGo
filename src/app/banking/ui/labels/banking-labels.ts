import { AccountKind } from '@app/banking/domain/models/account.model';
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
