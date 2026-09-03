import { IndexedDbConfig } from '../app/idb/data-access/service/idb.config';
import { NgRxDevToolsConfig } from '../app/ngrx/utils/ngrx.providers';
import { CreateUserConfig } from '../app/users/feature/create-user/create-user.config';

export interface Environment {
  production: boolean;
  ngrxDevToolsConfig: NgRxDevToolsConfig;
  idbConfig: IndexedDbConfig;
}
