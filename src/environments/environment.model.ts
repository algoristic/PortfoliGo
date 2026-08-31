import { IndexedDbConfig } from '../app/idb/data-access/service/idb.config';
import { NgRxDevToolsConfig } from '../app/ngrx/utils/ngrx.providers';

export interface Environment {
  production: boolean;
  ngrxDevToolsConfig: NgRxDevToolsConfig;
  idbConfig: IndexedDbConfig;
}
