import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom } from 'rxjs';

import { ShellFacade } from './shell.facade';
import * as ShellSelectors from './shell.selectors';

describe('ShellFacade', () => {
  let facade: ShellFacade;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ShellFacade, provideMockStore()],
    });
    facade = TestBed.inject(ShellFacade);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('activeNavPath$', () => {
    it('emits the active area from the store', async () => {
      store.overrideSelector(ShellSelectors.selectActiveNavPath, 'taxes');
      expect(await firstValueFrom(facade.activeNavPath$)).toBe('taxes');
    });
  });
});
