// Framework-free: shared by the UI and the engine worker.

export const DB_NAME = 'portfoligo';
export const DB_VERSION = 3;

export interface IndexDefinition {
  name: string;
  keyPath: string | string[];
  options?: IDBIndexParameters;
}

export interface StoreDefinition {
  keyPath: string | string[];
  indexes?: IndexDefinition[];
}

export const STORE_NAMES = [
  'players',
  'runtime',
  'snapshots',
  'commands',
  'transactions',
  'orders',
  'notifications',
  'candles',
  'series',
  'meta',
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export const TRANSACTIONS_BY_ACCOUNT_INDEX = 'byAccount';

/** Object stores and their in-line keys (TS §9.1). */
export const STORES: Record<StoreName, StoreDefinition> = {
  players: { keyPath: 'id' },
  runtime: { keyPath: 'playerId' },
  snapshots: { keyPath: ['playerId', 'tick'] },
  commands: { keyPath: ['playerId', 'seq'] },
  transactions: {
    keyPath: ['playerId', 'seq'],
    indexes: [
      { name: TRANSACTIONS_BY_ACCOUNT_INDEX, keyPath: 'accountIds', options: { multiEntry: true } },
    ],
  },
  orders: { keyPath: ['playerId', 'orderId'] },
  notifications: { keyPath: ['playerId', 'seq'] },
  candles: { keyPath: ['playerId', 'instrumentId', 'resolution', 'bucket'] },
  series: { keyPath: ['playerId', 'name', 'year'] },
  meta: { keyPath: 'key' },
};
