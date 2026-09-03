import { Environment } from './environment.model';

export const commonSettings: Pick<Environment, 'idbConfig'> = {
  idbConfig: {
    databaseName: 'portfoligo',
    databaseVersion: 2,
    databaseStorages: [],
  },
};
