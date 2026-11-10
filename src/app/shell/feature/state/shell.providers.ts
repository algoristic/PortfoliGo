import { EnvironmentProviders, Provider } from '@angular/core';

import { ShellFacade } from './shell.facade';

// The shell has no slice of its own; its facade reads the router store.
export function provideShellState(): Array<Provider | EnvironmentProviders> {
  return [ShellFacade];
}
