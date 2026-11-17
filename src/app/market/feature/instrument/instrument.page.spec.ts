import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';

import { SubscriptionPayload } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
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
import {
  byTestId,
  click,
  queryByTestId,
  select,
  textOf,
  typeText,
  wheel,
} from '../../../../testing/dom';
import { renderRoute, settle } from '../../../../testing/page';
import { parseCompactEuros, parseEuros, parseGermanNumber } from '../../../../testing/parse';
import { installViewport } from '../../../../testing/viewport';
import { selectRouteInstrumentQuote } from '../state/market.selectors';

const ANNA: NewPlayer = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

const WORLD = generateMiniWorld(ANNA.seed).world;
// Shares come first in the series order (TS §8.2), so the first company is series 0.
const COMPANY = WORLD.companies[0];
const ETF = WORLD.etfs[0];
const ETF_INDEX = WORLD.indices.find((index) => index.id === ETF.indexId);
const ETF_ISSUER = WORLD.etfIssuers.find((issuer) => issuer.id === ETF.issuerId);
const ETF_EXCHANGE = EXCHANGES.find((exchange) => exchange.id === ETF.exchangeId);
const WORLD_INDEX = WORLD.indices.find((index) => index.kind === 'world');
if (
  ETF_INDEX === undefined ||
  ETF_ISSUER === undefined ||
  ETF_EXCHANGE === undefined ||
  WORLD_INDEX === undefined
) {
  throw new Error('The mini world lacks an ETF with index, issuer and exchange or a world index');
}
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

/** A day index (days since 01.01.2020) as `dd.mm.yyyy`, from `Date`. */
function date(day: number): string {
  const at = new Date(Date.UTC(2020, 0, 1) + day * MS_PER_DAY);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(at.getUTCDate())}.${pad(at.getUTCMonth() + 1)}.${at.getUTCFullYear()}`;
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

  async function openInstrument(id = COMPANY.id): Promise<void> {
    await harness.navigateByUrl(`/game/${playerId}/markets/${id}`);
    await run(200);
    await run(300);
  }

  function text(testId: string): string {
    return textOf(byTestId(page, testId));
  }

  /** The value of a stat tile (its second line, after the label). */
  function tileValue(testId: string): string {
    const value = byTestId(page, testId).querySelectorAll('span')[1];
    return value === undefined ? '' : textOf(value);
  }

  function all(testId: string): HTMLElement[] {
    return Array.from(page.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`));
  }

  /** Jumps to `minute` of Monday 01.04.2030 and lets the game run a few game minutes. */
  async function runFrom(minute: number): Promise<void> {
    await act(() => click(byTestId(page, 'shell.header.jump-button')));
    await act(() => click(byTestId(document.body, 'clock.jump-dialog.date-kind')));
    await act(() =>
      typeText(byTestId<HTMLInputElement>(document.body, 'clock.jump-dialog.date'), '2030-04-01'),
    );
    await act(() =>
      typeText(byTestId<HTMLInputElement>(document.body, 'clock.jump-dialog.time'), hhmm(minute)),
    );
    await act(() => click(byTestId(document.body, 'clock.jump-dialog.submit')));
    await run(500);
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

  // AP 5.8 acceptance: period and resolution combine, forbidden combinations can't be chosen, and
  // scrolling loads older candles in the chosen resolution.
  it('loads the chosen resolution, older candles in it and only allowed combinations', async () => {
    await openInstrument();
    const resolution = byTestId<HTMLSelectElement>(page, 'market.instrument.chart.resolution');

    function options(): string[] {
      return [...resolution.options].map(
        (option) => `${option.value}${option.disabled ? ' (gesperrt)' : ''}`,
      );
    }

    expect(resolution.value).toBe('auto');
    expect(textOf(resolution.options[0])).toBe('Auto (1 Min.)');
    expect(options()).toEqual(['auto', '1m', '5m', '15m', '1h', '1d (gesperrt)', '1w (gesperrt)']);

    // 5-minute candles of Friday 29.03.2030, then Thursday in front of them after scrolling.
    await act(() => select(resolution, '5m'));
    const perDay = Math.ceil(CLOSE / 5) - Math.floor(OPEN / 5);
    expect(chart()).toEqual({
      count: perDay,
      lastTick: tick(2030, 3, 29, Math.floor((CLOSE - 1) / 5) * 5),
    });
    expect(subscriptions('subscribe')).toContainEqual({
      series: [],
      charts: [{ series: 0, interval: '5m' }],
    });
    const canvas = byTestId(page, 'market.instrument.chart').querySelector('canvas');
    expect(canvas).not.toBeNull();
    await act(() => wheel(canvas as HTMLCanvasElement, 100));
    await run(300);
    expect(chart()).toEqual({
      count: 2 * perDay,
      lastTick: tick(2030, 3, 29, Math.floor((CLOSE - 1) / 5) * 5),
    });

    // 5T keeps 5 minutes; 1M doesn't allow them and falls back to „Auto“ (hourly candles).
    await act(() => click(byTestId(page, 'market.instrument.chart.range.5d')));
    expect(resolution.value).toBe('5m');
    expect(chart().count).toBe(5 * perDay);
    await act(() => click(byTestId(page, 'market.instrument.chart.range.1m')));
    expect(resolution.value).toBe('auto');
    expect(textOf(resolution.options[0])).toBe('Auto (1 Std.)');
    expect(options()).toEqual([
      'auto',
      '1m (gesperrt)',
      '5m (gesperrt)',
      '15m (gesperrt)',
      '1h',
      '1d',
      '1w',
    ]);

    // Weekly candles of the month: the weeks from Monday 04.03. to Monday 25.03.2030.
    await act(() => select(resolution, '1w'));
    expect(chart()).toEqual({ count: 4, lastTick: tick(2030, 3, 25) });

    // Max offers only „Auto“.
    await act(() => click(byTestId(page, 'market.instrument.chart.range.max')));
    expect(resolution.value).toBe('auto');
    expect(options().filter((option) => !option.endsWith('(gesperrt)'))).toEqual(['auto']);
  });

  it('updates the newest candle while the game runs', async () => {
    // The clock controls with the jump button need a wide header.
    const restoreViewport = installViewport(1024);
    onTestFinished(restoreViewport);
    await openInstrument();
    await act(() => click(byTestId(page, 'market.instrument.indicator.add')));
    await act(() => click(byTestId(page, 'market.instrument.indicator-form.submit')));

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
    // The SMA 20 follows the live candles.
    expect(byTestId(page, 'market.instrument.chart').getAttribute('data-overlay-points')).toBe(
      `i1:${minute - OPEN + 1 - 19}`,
    );
  });

  // PS US-CH-02: indicators with parameters and colours, kept per player.
  it('draws indicators, keeps them for the next visit and removes them', async () => {
    await openInstrument();
    const candles = CLOSE - OPEN;

    function overlayPoints(): string {
      return byTestId(page, 'market.instrument.chart').getAttribute('data-overlay-points') ?? '';
    }

    function label(id: string): string {
      return textOf(byTestId(page, `market.instrument.indicator.${id}.label`));
    }

    async function submitForm(period: string): Promise<void> {
      typeText(byTestId<HTMLInputElement>(page, 'market.instrument.indicator-form.period'), period);
      await act(() => click(byTestId(page, 'market.instrument.indicator-form.submit')));
    }

    // SMA 20 and Bollinger 20/2: a point from the 20th candle on, three lines for the bands.
    await act(() => click(byTestId(page, 'market.instrument.indicator.add')));
    await submitForm('20');
    await act(() => click(byTestId(page, 'market.instrument.indicator.add')));
    select(byTestId(page, 'market.instrument.indicator-form.kind'), 'bollinger');
    await submitForm('20');
    expect(label('i1')).toBe('SMA 20');
    expect(label('i2')).toBe('Bollinger 20/2');
    const points = candles - 19;
    expect(overlayPoints()).toBe(
      `i1:${points} i2.middle:${points} i2.upper:${points} i2.lower:${points}`,
    );
    // Middle, upper and lower band at the newest candle.
    expect(
      textOf(byTestId(page, 'market.instrument.indicator.i2.values')).split(' · '),
    ).toHaveLength(3);

    await act(() => click(byTestId(page, 'market.instrument.indicator.i1.edit')));
    await submitForm('50');
    expect(label('i1')).toBe('SMA 50');
    expect(overlayPoints()).toContain(`i1:${candles - 49} `);

    // A new visit of the game reads the indicators from pgo.ui.chart.
    await harness.navigateByUrl('/players');
    await run(200);
    await openInstrument();
    expect(label('i1')).toBe('SMA 50');
    expect(label('i2')).toBe('Bollinger 20/2');
    expect(overlayPoints()).toBe(
      `i1:${candles - 49} i2.middle:${points} i2.upper:${points} i2.lower:${points}`,
    );

    await act(() => click(byTestId(page, 'market.instrument.indicator.i2.remove')));
    expect(queryByTestId(page, 'market.instrument.indicator.i2')).toBeNull();
    expect(overlayPoints()).toBe(`i1:${candles - 49}`);
  });

  // AP 5.8 acceptance: the chosen colour draws the indicator, Bollinger bands are filled, and the
  // colour stays after a reload.
  it('draws indicators in the chosen colour and keeps it for the next visit', async () => {
    await openInstrument();

    function chartAttribute(name: string): string {
      return byTestId(page, 'market.instrument.chart').getAttribute(name) ?? '';
    }

    function checkedColor(): string | undefined {
      return [
        ...page.querySelectorAll<HTMLInputElement>(
          '[data-testid^="market.instrument.indicator-form.color."]',
        ),
      ].find((radio) => radio.checked)?.value;
    }

    // A new indicator starts with the first free colour; Bollinger in violet with a filled band.
    await act(() => click(byTestId(page, 'market.instrument.indicator.add')));
    expect(checkedColor()).toBe('chart-1');
    select(byTestId(page, 'market.instrument.indicator-form.kind'), 'bollinger');
    await act(() => click(byTestId(page, 'market.instrument.indicator-form.color.chart-4')));
    await act(() => click(byTestId(page, 'market.instrument.indicator-form.submit')));
    expect(chartAttribute('data-overlay-colors')).toBe(
      'i1.middle:chart-4 i1.upper:chart-4 i1.lower:chart-4',
    );
    expect(chartAttribute('data-overlay-fills')).toBe('i1.upper');

    // Another indicator gets blue, the first free colour, and may take violet as well.
    await act(() => click(byTestId(page, 'market.instrument.indicator.add')));
    expect(checkedColor()).toBe('chart-1');
    await act(() => click(byTestId(page, 'market.instrument.indicator-form.color.chart-4')));
    await act(() => click(byTestId(page, 'market.instrument.indicator-form.submit')));
    expect(chartAttribute('data-overlay-colors')).toContain('i2:chart-4');

    // Changing the colour of the Bollinger bands.
    await act(() => click(byTestId(page, 'market.instrument.indicator.i1.edit')));
    expect(checkedColor()).toBe('chart-4');
    await act(() => click(byTestId(page, 'market.instrument.indicator-form.color.chart-2')));
    await act(() => click(byTestId(page, 'market.instrument.indicator-form.submit')));
    const colors = 'i1.middle:chart-2 i1.upper:chart-2 i1.lower:chart-2 i2:chart-4';
    expect(chartAttribute('data-overlay-colors')).toBe(colors);

    // A new visit of the game reads the colours from pgo.ui.chart.
    await harness.navigateByUrl('/players');
    await run(200);
    await openInstrument();
    expect(chartAttribute('data-overlay-colors')).toBe(colors);
    expect(chartAttribute('data-overlay-fills')).toBe('i1.upper');
  });

  // AP 4.5 acceptance (US-MK-03, US-MK-05): every detail of a share, live and highlighted, and
  // adding it to the watchlist. Expected values come from the world and the engine's queries.
  it('shows head, figures, profile, dividends and index membership of a share', async () => {
    const restoreViewport = installViewport(1024);
    onTestFinished(restoreViewport);
    await openInstrument();
    const engineService = TestBed.inject(EngineService);
    const { figures } = await firstValueFrom(engineService.instrumentFigures(COMPANY.id));
    const { details } = await firstValueFrom(engineService.instrumentDetails(COMPANY.id));
    const dividends = await firstValueFrom(engineService.instrumentDividends(COMPANY.id));

    // Head: master data, last price, bid, ask and spread; the game starts paused at Mon 00:00.
    expect(text('market.instrument.name')).toBe(COMPANY.name);
    expect(text('market.instrument.ticker')).toBe(COMPANY.ticker);
    expect(text('market.instrument.isin')).toBe(COMPANY.isin);
    expect(text('market.instrument.exchange')).toBe(EXCHANGE.name);
    expect(text('market.instrument.kind')).toBe('Aktie');
    expect(text('market.instrument.chart.readout.close')).toMatch(/€$/);
    const last = parseEuros(text('market.instrument.last'));
    const digits = figures.last >= 10 ? 2 : figures.last >= 1 ? 3 : 4;
    expect(last).toBeCloseTo(figures.last, digits);
    const bid = parseEuros(text('market.instrument.bid'));
    const ask = parseEuros(text('market.instrument.ask'));
    expect(bid).toBeLessThan(ask);
    expect(parseEuros(text('market.instrument.spread'))).toBeCloseTo(ask - bid, digits);
    expect(
      parseGermanNumber(text('market.instrument.spread-percent').replace(/[()]/g, '')),
    ).toBeCloseTo((ask - bid) / ((ask + bid) / 2), 4);
    expect(text('market.instrument.change-percent')).toMatch(/%$/);
    expect(text('market.instrument.status')).toBe(`Geschlossen · öffnet Mo., ${hhmm(OPEN)}`);
    expect(text('market.instrument.closed')).toContain('Börse geschlossen');

    // Key figures at the displayed precision.
    const marketCap = parseCompactEuros(tileValue('market.instrument.figures.size'));
    expect(Math.abs(marketCap.value - (figures.marketCap ?? Number.NaN))).toBeLessThanOrEqual(
      0.05 * marketCap.factor,
    );
    const percent = (testId: string): number => parseGermanNumber(tileValue(testId));
    expect(percent('market.instrument.figures.volatility')).toBeCloseTo(figures.volatility ?? 0, 3);
    expect(percent('market.instrument.figures.beta')).toBeCloseTo(figures.beta ?? 0, 2);
    expect(percent('market.instrument.figures.dividend-yield')).toBeCloseTo(
      figures.dividendYield ?? 0,
      4,
    );
    for (const period of ['m1', 'y1', 'y5'] as const) {
      expect(percent(`market.instrument.figures.${period}`)).toBeCloseTo(
        figures.performance[period] ?? 0,
        4,
      );
    }

    // Profile with the text of the template code and the indices of the share.
    expect(text('market.instrument.profile.description')).toContain(String(COMPANY.foundedYear));
    expect(text('market.instrument.profile.founded')).toBe(String(COMPANY.foundedYear));
    expect(parseGermanNumber(text('market.instrument.profile.employees'))).toBe(COMPANY.employees);
    expect(text('market.instrument.profile.risk-class')).toBe(`${COMPANY.riskClass} von 5`);
    expect(text('market.instrument.profile.sector')).not.toBe(COMPANY.sectorId);
    expect(details.kind === 'stock' && details.indexIds.length).toBeGreaterThan(0);
    expect(
      all('market.instrument.profile.indices.item').map((item) =>
        item.getAttribute('data-instrument-id'),
      ),
    ).toEqual(details.kind === 'stock' ? details.indexIds : []);

    // Dividends: the history of the engine, newest first, and the next date.
    expect(all('market.instrument.dividends.history.row')).toHaveLength(dividends.history.length);
    all('market.instrument.dividends.history.ex-day').forEach((cell, index) =>
      expect(textOf(cell)).toBe(date(dividends.history[index].exDay)),
    );
    // Amounts per share with up to four decimal places, exactly the engine's (TS §6.5).
    all('market.instrument.dividends.history.amount').forEach((cell, index) =>
      expect(parseEuros(textOf(cell))).toBeCloseTo(dividends.history[index].cents / 100, 6),
    );
    if (dividends.next !== null) {
      expect(text('market.instrument.dividends.next.ex-day')).toBe(date(dividends.next.exDay));
      expect(text('market.instrument.dividends.next.payment-day')).toBe(
        date(dividends.next.paymentDay),
      );
      if (dividends.next.cents === null) {
        expect(text('market.instrument.dividends.next.amount')).toBe('noch nicht angekündigt');
      } else {
        expect(parseEuros(text('market.instrument.dividends.next.amount'))).toBeCloseTo(
          dividends.next.cents / 100,
          6,
        );
      }
    }
    // Shares have no composition.
    expect(queryByTestId(page, 'market.instrument.composition')).toBeNull();

    // Add to the watchlist from the head.
    const star = byTestId(page, 'market.instrument.watchlist');
    expect(star.getAttribute('aria-pressed')).toBe('false');
    await act(() => click(star));
    await run(200);
    expect(byTestId(page, 'market.instrument.watchlist').getAttribute('aria-pressed')).toBe('true');

    // Live: once the exchange trades, the last price moves and flashes (US-MK-05).
    const lastElement = byTestId(page, 'market.instrument.last');
    const flashes: string[] = [];
    const observer = new MutationObserver(() => {
      const flash = lastElement.getAttribute('data-flash');
      if (flash !== null) {
        flashes.push(flash);
      }
    });
    observer.observe(lastElement, { attributes: true, attributeFilter: ['data-flash'] });
    onTestFinished(() => observer.disconnect());
    await runFrom(OPEN + 60);
    expect(text('market.instrument.status')).toBe(`Geöffnet · schließt Mo., ${hhmm(CLOSE)}`);
    expect(queryByTestId(page, 'market.instrument.closed')).toBeNull();
    const opened = text('market.instrument.last');
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    // The last price moves by whole cents and may come back, so every second counts.
    const seen = new Set<string>();
    for (let second = 0; second < 3; second++) {
      await run(1_000);
      seen.add(text('market.instrument.last'));
    }
    await act(() => click(byTestId(page, 'shell.header.toggle-pause')));
    await run(500);
    seen.delete(opened);
    expect(seen.size).toBeGreaterThan(0);
    expect(flashes.length).toBeGreaterThan(0);
    expect(flashes.every((flash) => flash === 'up' || flash === 'down')).toBe(true);
  });

  it('shows index, costs, issuer, positions, splits and iNAV of an ETF', async () => {
    await openInstrument(ETF.id);
    const engineService = TestBed.inject(EngineService);
    const { figures } = await firstValueFrom(engineService.instrumentFigures(ETF.id));
    const { composition } = await firstValueFrom(engineService.instrumentComposition(ETF.id));

    expect(text('market.instrument.name')).toBe(ETF.name);
    expect(text('market.instrument.kind')).toBe('ETF');
    expect(text('market.instrument.exchange')).toBe(ETF_EXCHANGE.name);
    expect(parseEuros(text('market.instrument.inav'))).toBeCloseTo(figures.indicativeValue ?? 0, 2);
    expect(text('market.instrument.inav-tick')).toBe('Stand Mo., 00:00');

    expect(text('market.instrument.profile.index')).toBe(ETF_INDEX.name);
    expect(byTestId(page, 'market.instrument.profile.index').getAttribute('href')).toBe(
      `/game/${playerId}/markets/${ETF.indexId}`,
    );
    expect(parseGermanNumber(text('market.instrument.profile.ter'))).toBeCloseTo(ETF.ter, 4);
    expect(text('market.instrument.profile.issuer')).toBe(ETF_ISSUER.name);
    const volume = parseCompactEuros(text('market.instrument.profile.fund-volume'));
    expect(Math.abs(volume.value - ETF.fundVolume / 100)).toBeLessThanOrEqual(0.05 * volume.factor);
    const distribution = text('market.instrument.profile.distribution');
    expect(distribution).toBe(
      ETF.distribution.kind === 'accumulating'
        ? 'Thesaurierend'
        : ETF.distribution.frequency === 'quarterly'
          ? 'Ausschüttend, vierteljährlich'
          : 'Ausschüttend, jährlich',
    );

    // The largest positions and the splits of the tracked index.
    expect(composition).not.toBeNull();
    expect(all('market.instrument.composition.top.name').map((cell) => textOf(cell))).toEqual(
      composition?.top.map((position) => position.name),
    );
    expect(text('market.instrument.composition.count')).toBe(
      `Werte im Index: ${ETF_INDEX.constituents.length}`,
    );
    const regions = all('market.instrument.composition.regions.item');
    expect(regions.map((item) => item.getAttribute('data-key'))).toEqual(
      composition?.regions.map((share) => share.key),
    );
    expect(all('market.instrument.composition.sectors.item').length).toBe(
      Math.min(composition?.sectors.length ?? 0, 6),
    );
    expect(
      byTestId(page, 'market.instrument.composition.regions')
        .querySelector('svg')
        ?.getAttribute('aria-label'),
    ).toContain('Regionen');

    // Dividends: accumulating ETFs say so, distributing ones show the next date without amount.
    if (ETF.distribution.kind === 'accumulating') {
      expect(queryByTestId(page, 'market.instrument.dividends.accumulating')).not.toBeNull();
    } else if (queryByTestId(page, 'market.instrument.dividends.next') !== null) {
      expect(text('market.instrument.dividends.next.amount')).toBe(
        'Betrag wird am Ex-Tag festgelegt',
      );
    }
  });

  it('shows an index without bid and ask and with its composition', async () => {
    await openInstrument(WORLD_INDEX.id);

    expect(text('market.instrument.name')).toBe(WORLD_INDEX.name);
    expect(text('market.instrument.kind')).toBe('Index');
    expect(queryByTestId(page, 'market.instrument.bid')).toBeNull();
    expect(queryByTestId(page, 'market.instrument.ask')).toBeNull();
    expect(queryByTestId(page, 'market.instrument.spread')).toBeNull();
    expect(queryByTestId(page, 'market.instrument.dividends')).toBeNull();
    expect(text('market.instrument.profile.variant')).toBe('Kursindex');
    // Index levels are points: the head, the candle readout and the indicator legend show no euros.
    expect(text('market.instrument.last')).not.toContain('€');
    expect(text('market.instrument.chart.readout.close')).toMatch(/\d,\d{2}$/);
    expect(text('market.instrument.chart.readout.close')).not.toContain('€');
    await act(() => click(byTestId(page, 'market.instrument.indicator.add')));
    await act(() => click(byTestId(page, 'market.instrument.indicator-form.submit')));
    expect(text('market.instrument.indicator.i1.values')).toMatch(/\d,\d{2}$/);
    expect(text('market.instrument.indicator.i1.values')).not.toContain('€');
    expect(parseGermanNumber(text('market.instrument.profile.constituents'))).toBe(
      WORLD_INDEX.constituents.length,
    );
    expect(all('market.instrument.composition.top.row').length).toBe(
      Math.min(10, WORLD_INDEX.constituents.length),
    );
    // The world index is its own benchmark (TS §8.2: beta exactly 1).
    expect(tileValue('market.instrument.figures.beta')).toBe('1,00');

    // A position opens the share: the page loads it in place.
    await act(() => click(all('market.instrument.composition.top.name')[0]));
    await run(300);
    expect(text('market.instrument.kind')).toBe('Aktie');
    expect(queryByTestId(page, 'market.instrument.composition')).toBeNull();
    expect(queryByTestId(page, 'market.instrument.profile.description')).not.toBeNull();
  });

  it('says so when the instrument does not exist', async () => {
    await openInstrument('stk-9999');
    expect(text('market.instrument.not-found')).toContain('Wertpapier nicht gefunden');
  });
});
