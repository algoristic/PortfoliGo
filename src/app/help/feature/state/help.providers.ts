import { EnvironmentProviders, Provider } from '@angular/core';

import { HelpFacade } from './help.facade';

// The help pages have no slice of their own; the facade reads the router store.
export function provideHelpState(): Array<Provider | EnvironmentProviders> {
  return [HelpFacade];
}
