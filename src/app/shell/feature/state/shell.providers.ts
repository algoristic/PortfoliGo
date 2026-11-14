import { EnvironmentProviders, inject, Provider } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { provideEffects } from '@ngrx/effects';

import { GLOSSARY_LINK } from '@app/help/ui/term-hint/glossary-link.config';

import { ShellEffects } from './shell.effects';
import { ShellFacade } from './shell.facade';

/**
 * The shell has no slice of its own: its facade reads the router store and the session, its
 * effects open the command palette (PS US-UI-05). The context help links the glossary of the game.
 */
export function provideShellState(): Array<Provider | EnvironmentProviders> {
  return [
    ShellFacade,
    provideEffects(ShellEffects),
    {
      provide: GLOSSARY_LINK,
      useFactory: () => toSignal(inject(ShellFacade).glossaryLink$, { initialValue: '/help' }),
    },
  ];
}
