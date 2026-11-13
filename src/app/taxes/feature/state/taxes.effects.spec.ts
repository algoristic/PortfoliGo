import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { firstValueFrom, Subject, take, toArray } from 'rxjs';
import type { Mocked } from 'vitest';

import { TaxesProjectionUpdate } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { PlayerProfile } from '@app/players/domain/models/player.model';

import * as TaxesActions from './taxes.actions';
import { TaxesEffects } from './taxes.effects';

function taxes(tick: number, full: boolean, year: number): TaxesProjectionUpdate {
  return {
    tick,
    full,
    current: {
      year,
      lossCarryForward: 0,
      income: 0,
      withheld: 0,
      interest: 0,
      distributions: 0,
      gains: 0,
      losses: 0,
      paid: 0,
      refunded: 0,
    },
    closed: [],
  };
}

describe('TaxesEffects', () => {
  let effects: TaxesEffects;
  let actions$: Subject<Action>;
  let taxes$: Subject<TaxesProjectionUpdate>;
  let engine: Mocked<Pick<EngineService, 'taxes$'>>;

  beforeEach(() => {
    actions$ = new Subject();
    taxes$ = new Subject();
    engine = { taxes$: taxes$.asObservable() };
    TestBed.configureTestingModule({
      providers: [
        TaxesEffects,
        provideMockActions(() => actions$.asObservable()),
        { provide: EngineService, useValue: engine },
      ],
    });
    effects = TestBed.inject(TaxesEffects);
  });

  describe('watchTaxes$', () => {
    it('takes the last full tax part before the reply to loadPlayer and every one after it', async () => {
      const profile = { id: 'p-b' } as PlayerProfile;
      const result = firstValueFrom(effects.watchTaxes$.pipe(take(3), toArray()));
      actions$.next(SessionActions.enterGame({ profile }));
      taxes$.next(taxes(1, false, 2040));
      taxes$.next(taxes(2, true, 2041));
      taxes$.next(taxes(3, true, 2030));
      taxes$.next(taxes(4, false, 2042));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 4 } }));
      taxes$.next(taxes(5, false, 2043));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-b', tick: 5 } }));
      taxes$.next(taxes(6, false, 2030));
      taxes$.next(taxes(7, true, 2031));
      expect(await result).toEqual([
        TaxesActions.receivedTaxes({ taxes: taxes(3, true, 2030) }),
        TaxesActions.receivedTaxes({ taxes: taxes(6, false, 2030) }),
        TaxesActions.receivedTaxes({ taxes: taxes(7, true, 2031) }),
      ]);
    });

    it('drops the tax parts after the game was left', () => {
      const received: Action[] = [];
      const subscription = effects.watchTaxes$.subscribe((action) => received.push(action));
      actions$.next(SessionActions.enterGame({ profile: { id: 'p-a' } as PlayerProfile }));
      actions$.next(SessionActions.loadPlayerSuccess({ loaded: { playerId: 'p-a', tick: 1 } }));
      taxes$.next(taxes(1, false, 2030));
      actions$.next(SessionActions.leaveGame());
      taxes$.next(taxes(2, false, 2031));
      subscription.unsubscribe();
      expect(received).toEqual([TaxesActions.receivedTaxes({ taxes: taxes(1, false, 2030) })]);
    });
  });
});
