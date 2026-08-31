import { commonSettings } from './environment.common';
import { Environment } from './environment.model';

export const environment: Environment = {
  production: true,
  ngrxDevToolsConfig: 'none',
  ...commonSettings,
};
