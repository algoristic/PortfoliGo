import { Environment } from './environment.model';

export const commonSettings: Pick<Environment, 'idbConfig' | 'newUser'> = {
  idbConfig: {
    databaseName: 'portfoligo',
    databaseVersion: 1,
    databaseStorages: [],
  },
  newUser: {
    startingCapital: { initial: 10_000, min: 0, max: 100_000 },
    monthlySavingsAmount: { initial: 200, min: 0, max: 1_000 },
  },
};
