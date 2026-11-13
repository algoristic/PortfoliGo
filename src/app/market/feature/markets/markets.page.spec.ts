import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
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

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

const WORLD = generateMiniWorld(ANNA.seed).world;
// Series order (TS §8.2): shares, then the price indices in world order. The page watches the
// price indices except the sector indices, whose quotes come with the movers.
const OVERVIEW_SERIES = WORLD.indices
  .map((index, position) => ({ kind: index.kind, series: WORLD.companies.length + position }))
  .filter(({ kind }) => kind !== 'sector')
  .map(({ series }) => series);

describe('MarketsPage', () => {
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

  it('subscribes the movers and the overview indices and ends them when it is left', async () => {
    await harness.navigateByUrl(`/game/${playerId}/markets`);
    await run(200);
    expect(subscriptions('subscribe')).toContainEqual({ series: [], movers: true });
    expect(subscriptions('subscribe')).toContainEqual({ series: OVERVIEW_SERIES });

    await harness.navigateByUrl(`/game/${playerId}/banks`);
    await run(200);
    expect(subscriptions('unsubscribe')).toContainEqual({ series: [], movers: true });
    expect(subscriptions('unsubscribe')).toContainEqual({ series: OVERVIEW_SERIES });
  });
});
