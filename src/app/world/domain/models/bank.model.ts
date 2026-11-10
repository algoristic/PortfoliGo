import { BankConditions, BankType } from '../../../banking/domain/models/bank-conditions.model';

export interface Bank {
  id: string;
  name: string;
  type: BankType;
  conditions: BankConditions;
}
