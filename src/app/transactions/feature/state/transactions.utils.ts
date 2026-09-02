import { v4 as createId } from 'uuid';

import { User } from '../../../users/domain/models/users.model';
import { Transaction } from '../../domain/models/transactions.model';

export function convertInitialCapitalDeposit(user: User, amount: number): Transaction {
  return {
    id: createId(),
    userId: user.id,
    type: 'InitialCapitalDeposit',
    timestamp: new Date().toISOString(),
    amount,
  };
}
