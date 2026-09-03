import { InjectionToken } from '@angular/core';

export interface CreateUserConfig {
  startingCapital: {
    initial: number;
    min: number;
    max: number;
  };
  monthlySavingsAmount: {
    initial: number;
    min: number;
    max: number;
  };
}

export const CREATE_USER_CONFIG = new InjectionToken<CreateUserConfig>('CREATE_USER_CONFIG', {
  factory: () => ({
    startingCapital: {
      initial: 10_000,
      min: 0,
      max: 100_000,
    },
    monthlySavingsAmount: {
      initial: 200,
      min: 0,
      max: 1_000,
    },
  }),
});
