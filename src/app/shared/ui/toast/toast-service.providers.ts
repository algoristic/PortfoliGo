import { EnvironmentProviders, Provider } from '@angular/core';

import { ToastService } from './toast.service';

export function provideToastService(): Array<Provider | EnvironmentProviders> {
  return [ToastService];
}
