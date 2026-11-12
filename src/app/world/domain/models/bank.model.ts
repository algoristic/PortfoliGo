import { BankConditions, BankType } from '@app/banking/domain/models/bank-conditions.model';

export interface Bank {
  id: string;
  name: string;
  type: BankType;
  conditions: BankConditions;
}
