import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';

import { SubscriptionPayload } from '@app/engine/data-access/service/engine-service.model';
import {
  generateMiniWorld,
  InProcessEngine,
  provideInProcessEngineWorker,
} from '@app/engine/data-access/testing/in-process-engine-worker';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { PlayersService } from '@app/players/data-access/service/players.service';
import { providePlayersTestPorts } from '@app/players/data-access/testing/fake-players-ports';
import { NewPlayer } from '@app/players/domain/models/player.model';

import { renderRoute, settle } from '../../../../testing/page';
import { selectRouteInstrumentQuote } from '../state/market.selectors';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

// Shares come first in the series order (TS §8.2), so the first company is series 0.
const COMPANY = generateMiniWorld(ANNA.seed).world.companies[0];

describe('InstrumentPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let playerId: string;

  beforeEach(async () => {
    localStorage.clear();
    const locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    const { profile } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA));
    playerId = profile.id;
  });

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  function subscriptions(type: 'subscribe' | 'unsubscribe'): SubscriptionPayload[] {
    return (engine.current?.received ?? [])
      .filter((message) => message.type === type)
      .map((message) => message.payload as SubscriptionPayload);
  }

  it('subscribes the quote of its instrument and ends the subscription when left', async () => {
    await harness.navigateByUrl(`/game/${playerId}/markets/${COMPANY.id}`);
    await run(200);
    await run(300);

    expect(subscriptions('subscribe')).toContainEqual({ series: [0] });
    const shown = await firstValueFrom(TestBed.inject(Store).select(selectRouteInstrumentQuote));
    expect(shown?.instrument.id).toBe(COMPANY.id);
    expect(shown?.instrument.series).toBe(0);
    expect(shown?.quote?.series).toBe(0);
    expect(shown?.quote?.last).toBeGreaterThan(0);

    await harness.navigateByUrl(`/game/${playerId}/banks`);
    await run(200);
    expect(subscriptions('unsubscribe')).toContainEqual({ series: [0] });
  });
});
