import { NgRxDevToolsConfig } from '../app/ngrx/utils/ngrx.providers';

export interface Environment {
  production: boolean;
  ngrxDevToolsConfig: NgRxDevToolsConfig;
}
