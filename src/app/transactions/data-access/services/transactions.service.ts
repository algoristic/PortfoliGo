import { inject, Injectable } from '@angular/core';

import { Observable } from 'rxjs';

import { transactionsStorage, transactionsUserIndex } from './transactions-service.providers';

import { IndexedDbService } from '../../../idb/data-access/service/idb.service';
import { User } from '../../../users/domain/models/users.model';
import { Transaction } from '../../domain/models/transactions.model';

@Injectable()
export class TransactionsService {
  private readonly idbService = inject(IndexedDbService);

  getTransActionsForUser(user: User): Observable<Transaction[]> {
    return this.idbService.getMany(transactionsStorage.name, transactionsUserIndex, user.id);
  }

  executeTransaction(transaction: Transaction): Observable<Transaction> {
    return this.idbService.add(transactionsStorage.name, transaction.id, transaction);
  }
}
