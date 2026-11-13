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
import { EXCHANGES } from '@app/world/domain/taxonomy';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { byTestId, click, textOf, typeText } from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { installViewport } from '../../../../testing/viewport';
import { selectRouteInstrumentQuote } from '../state/market.selectors';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

// Shares come first in the series order (TS §8.2), so the first company is series 0.
const COMPANY = generateMiniWorld(ANNA.seed).world.companies[0];
const EXCHANGE = EXCHANGES.find((exchange) => exchange.id === COMPANY.exchangeId);
if (EXCHANGE === undefined) {
  throw new Error('The company has no exchange');
}
/** Trading hours of the share in minutes of the day (TS §3.3). */
const { open: OPEN, close: CLOSE } = EXCHANGE;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Tick of a game time (UTC): game minutes since 01.01.2020, 00:00 (TS §4.2). */
function tick(year: number, month: number, day: number, minute = 0): number {
  return (Date.UTC(year, month - 1, day) - Date.UTC(2020, 0, 1)) / MS_PER_MINUTE + minute;
}

/** Weekdays (market days, TS §3.3) from `from` to `to`, both included; from `Date`. */
function weekdaysBetween(from: number, to: number): number {
  let count = 0;
  for (let ms = from; ms <= to; ms += MS_PER_DAY) {
    const weekday = new Date(ms).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      count++;
    }
  }
  return count;
}

function hhmm(minuteOfDay: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;
}

describe('InstrumentPage', () => {
  let engine: InProcessEngine;
  let harness: RouterTestingHarness;
  let page: HTMLElement;
  let playerId: string;
  let restorePlatform: () => void;

  beforeEach(async () => {
    localStorage.clear();
    restorePlatform = installChartPlatform();
    const locks = new FakePlayerLocks();
    engine = new InProcessEngine({ storage: 'indexed-db', locks });
    harness = await renderRoute('/players', [
      provideInProcessEngineWorker(engine),
      providePlayersTestPorts({ locks }),
    ]);
    page = harness.fixture.nativeElement;
    const { profile } = await firstValueFrom(TestBed.inject(PlayersService).createPlayer(ANNA));
    playerId = profile.id;
  });

  afterEach(() => restorePlatform());

  async function run(ms: number): Promise<void> {
    await engine.advance(ms);
    await settle(harness.fixture);
  }

  async function act(action: () => void): Promise<void> {
    action();
    await settle(harness.fixture);
    await run(200);
  }

  async function openInstrument(): Promise<void> {
    await harness.navigateByUrl(`/game/${playerId}/markets/${COMPANY.id}`);
    await run(200);
    await run(300);
  }

  function subscriptions(type: 'subscribe' | 'unsubscribe'): SubscriptionPayload[] {
    return (engine.current?.received ?? [])
      .filter((message) => message.type === type)
      .map((message) => message.payload as SubscriptionPayload);
  }

  function chart(): { count: number; lastTick: number } {
    const element = byTestId(page, 'market.instrument.chart');
    return {
      count: Number(element.getAttribute('data-candle-count')),
      lastTick: Number(element.getAttribute('data-last-tick')),
    };
  }

  function shownDay(): string {
    return textOf(byTestId(page, 'market.instrument.chart.day'));
  }

  it('subscribes the quote of its instrument and ends the subscription when left', async () => {
    await openInstrument();

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

  it('shows the minute candles of the last market day and of any past day', async () => {
    await openInstrument();
    expect(textOf(byTestId(page, 'market.instrument.name'))).toBe(COMPANY.name);

    // The game starts on Monday 01.04.2030 at 00:00 before the open, so 1T shows Friday: one candle
    // per minute of the session, the last one starting a minute before the close.
    expect(shownDay()).toBe('29.03.2030');
    expect(chart()).toEqual({ count: CLOSE - OPEN, lastTick: tick(2030, 3, 29, CLOSE - 1) });
    expect(subscriptions('subscribe')).toContainEqual({
      series: [],
      charts: [{ series: 0, interval: '1m' }],
    });

    await act(() => click(byTestId(page, 'market.instrument.chart.previous-day')));
    expect(shownDay()).toBe('28.03.2030');
    expect(chart()).toEqual({ count: CLOSE - OPEN, lastTick: tick(2030, 3, 28, CLOSE - 1) });
    // A chosen past day has no live candles.
    expect(subscriptions('unsubscribe')).toContainEqual({
      series: [],
      charts: [{ series: 0, interval: '1m' }],
    });

    // A Sunday before the game start shows the Friday before it.
    await act(() => {
      const date = byTestId<HTMLInputElement>(page, 'market.instrument.chart.date');
      typeText(date, '2025-06-08');
      date.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(shownDay()).toBe('06.06.2025');
    expect(chart()).toEqual({ count: CLOSE - OPEN, lastTick: tick(2025, 6, 6, CLOSE - 1) });

    await act(() => click(byTestId(page, 'market.instrument.chart.next-day')));
    expect(shownDay()).toBe('09.06.2025');

    await act(() => click(byTestId(page, 'market.instrument.chart.today')));
    expect(shownDay()).toBe('29.03.2030');
    expect(chart().lastTick).toBe(tick(2030, 3, 29, CLOSE - 1));
  });

  it('changes the resolution with the period', async () => {
    await openInstrument();

    // 5T: 15-minute candles of the last five market days, Mon 25.03. to Fri 29.03.2030.
    await act(() => click(byTestId(page, 'market.instrument.chart.range.5d')));
    const perDay = Math.ceil(CLOSE / 15) - Math.floor(OPEN / 15);
    expect(chart().count).toBe(5 * perDay);
    expect(chart().lastTick).toBe(tick(2030, 3, 29, Math.floor((CLOSE - 1) / 15) * 15));

    // 1J: daily candles from 01.04.2029 to the last market day before today's open.
    await act(() => click(byTestId(page, 'market.instrument.chart.range.1y')));
    expect(chart()).toEqual({
      count: weekdaysBetween(Date.UTC(2029, 3, 1), Date.UTC(2030, 2, 29)),
      lastTick: tick(2030, 3, 29),
    });

    // Max: weekly candles from the week of the epoch (Mon 30.12.2019) to the week before today.
    await act(() => click(byTestId(page, 'market.instrument.chart.range.max')));
    const weeks = (Date.UTC(2030, 2, 25) - Date.UTC(2019, 11, 30)) / (7 * MS_PER_DAY) + 1;
    expect(chart()).toEqual({ count: weeks, lastTick: tick(2030, 3, 25) });
    expect(byTestId(page, 'market.instrument.chart.range.max').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('updates the newest candle while the game runs', async () => {
    // The clock controls with the jump button need a wide header.
    const restoreViewport = installViewport(1024);
    onTestFinished(restoreViewport);
    await openInstrument();

    // Jump to an hour after the open and let the game run at 1 min/s (TS §3.4).
    await act(() => click(byTestId(page, 'shell.header.jump-button')));
    await act(() => click(byTestId(document.body, 'clock.jump-dialog.date-kind')));
    await act(() =>
      typeText(byTestId<HTMLInputElement>(document.body, 'clock.jump-dialog.date'), '2030-04-01'),
    );
    await act(() =>
      typeText(
        byTestId<HTMLInputElement>(document.body, 'clock.jump-dialog.time'),
        hhmm(OPEN + 60),
      ),
    );
    await act(() => click(byTestId(document.body, 'clock.jump-dialog.submit')));
    await run(500);
    expect(shownDay()).toBe('01.04.2030');

    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(3_000);
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(1_200);

    // The running candle starts at the current game minute; one candle per minute since the open.
    const clock = /(\d{2}):(\d{2})$/.exec(textOf(byTestId(page, 'shell.header.clock')));
    const minute = Number(clock?.[1]) * 60 + Number(clock?.[2]);
    expect(minute).toBeGreaterThan(OPEN + 60);
    expect(chart()).toEqual({ count: minute - OPEN + 1, lastTick: tick(2030, 4, 1, minute) });
  });
});
