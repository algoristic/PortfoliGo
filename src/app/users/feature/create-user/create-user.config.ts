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

export const CREATE_USER_CONFIG = new InjectionToken<CreateUserConfig>('CREATE_USER_CONFIG');
