interface CommonTransactionProperties {
  id: string;
  userId: string;
  timestamp: string; // TODO hier hinter steht auch die Frage danach, wie ich die Zeit im Spiel bereichne?
  amount: number;
}

export interface InitialCapitalDeposit extends CommonTransactionProperties {
  type: 'InitialCapitalDeposit';
}

export interface MonthlySavingsDeposit extends CommonTransactionProperties {
  type: 'MonthlySavingsDeposit';
}

export type Transaction = InitialCapitalDeposit | MonthlySavingsDeposit;
