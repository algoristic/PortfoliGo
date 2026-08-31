import { InjectionToken } from '@angular/core';

export interface IdbIndex {
  keyPath: string;
  options: IDBIndexParameters;
}

export interface IdbStorage {
  name: string;
  indexes?: Array<string | IdbIndex>;
}

export interface IndexedDbConfig {
  databaseName: string;
  databaseVersion: number;
  databaseStorages: IdbStorage[];
}

export const INDEXED_DB_CONFIG = new InjectionToken<IndexedDbConfig>('INDEXED_DB_CONFIG');
