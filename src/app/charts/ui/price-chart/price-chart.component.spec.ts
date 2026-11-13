import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { MockInstance } from 'vitest';

import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import { Candle } from '@app/market/domain/models/candle.model';

import { PriceChartComponent } from './price-chart.component';
import { PRICE_CHART_LIBRARY, PriceChartLibrary } from './price-chart.config';
import { PriceChartRange } from './price-chart.model';

import { installChartPlatform } from '../../../../testing/chart-platform';
import { wheel } from '../../../../testing/dom';
import { settle } from '../../../../testing/page';

const STEP = 15;

/** `count` 15-minute candles from `start` on. */
function candles(start: number, count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    tick: start + index * STEP,
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
  }));
}

interface RecordedSeries {
  series: ISeriesApi<SeriesType>;
  setData: MockInstance;
  update: MockInstance;
}

/** What the component did with the real library. */
interface LibraryCalls {
  loads: number;
  chart?: IChartApi;
  remove?: MockInstance;
  removeSeries?: MockInstance;
  series: RecordedSeries[];
}

/** The real lightweight-charts, wrapped to record the chart and series calls. */
function recordingLibrary(calls: LibraryCalls): () => Promise<PriceChartLibrary> {
  return async () => {
    calls.loads++;
    const library = await import('lightweight-charts');
    const createChart: PriceChartLibrary['createChart'] = (container, options) => {
      const chart = library.createChart(container, options);
      const addSeries = chart.addSeries.bind(chart);
      vi.spyOn(chart, 'addSeries').mockImplementation((definition, seriesOptions, pane) => {
        const series = addSeries(definition, seriesOptions, pane);
        calls.series.push({
          series,
          setData: vi.spyOn(series, 'setData'),
          update: vi.spyOn(series, 'update'),
        });
        return series;
      });
      calls.chart = chart;
      calls.remove = vi.spyOn(chart, 'remove');
      calls.removeSeries = vi.spyOn(chart, 'removeSeries');
      return chart;
    };
    return { ...library, createChart };
  };
}

describe('PriceChartComponent', () => {
  const start = 100 * TICKS_PER_DAY;
  let fixture: ComponentFixture<PriceChartComponent>;
  let requests: number;
  let ranges: Array<PriceChartRange | null>;
  let calls: LibraryCalls;
  let restorePlatform: () => void;

  function priceSeries(): RecordedSeries {
    const recorded = calls.series[0];
    if (recorded === undefined) {
      throw new Error('The chart has no series');
    }
    return recorded;
  }

  function canvas(): HTMLCanvasElement {
    const element = fixture.nativeElement.querySelector('canvas');
    if (element === null) {
      throw new Error('The chart has no canvas');
    }
    return element;
  }

  async function show(data: Candle[]): Promise<void> {
    fixture.componentRef.setInput('candles', data);
    await settle(fixture);
  }

  beforeEach(async () => {
    restorePlatform = installChartPlatform();
    calls = { loads: 0, series: [] };
    TestBed.configureTestingModule({
      providers: [{ provide: PRICE_CHART_LIBRARY, useValue: recordingLibrary(calls) }],
    });
    fixture = TestBed.createComponent(PriceChartComponent);
    fixture.componentRef.setInput('label', 'Kursverlauf');
    requests = 0;
    ranges = [];
    fixture.componentInstance.scrolledToStart.subscribe(() => requests++);
    fixture.componentInstance.changedVisibleRange.subscribe((range) => ranges.push(range));
    await show(candles(start, 130));
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    restorePlatform();
  });

  describe('library', () => {
    it('loads the library once, after the first render', async () => {
      expect(calls.loads).toBe(1);
      await show(candles(start, 20));
      expect(calls.loads).toBe(1);
      expect(canvas()).toBeTruthy();
    });

    it('removes the chart when the component is destroyed', () => {
      const container = fixture.componentInstance.container().nativeElement;
      expect(container.childElementCount).toBeGreaterThan(0);
      fixture.destroy();
      expect(calls.remove).toHaveBeenCalledTimes(1);
      expect(container.childElementCount).toBe(0);
    });
  });

  describe('live updates', () => {
    it('updates the running candle in place', async () => {
      const current = fixture.componentInstance.candles();
      const { setData, update } = priceSeries();
      setData.mockClear();
      const running = { ...current[current.length - 1], close: 12 };
      await show([...current.slice(0, -1), running]);
      expect(setData).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.lastCall?.[0]).toMatchObject({ close: 12 });
    });

    it('finishes the newest candle and appends the next with update', async () => {
      const current = fixture.componentInstance.candles();
      const { setData, update } = priceSeries();
      setData.mockClear();
      const last = current[current.length - 1];
      const finished = { ...last, close: 11 };
      const next = { ...last, tick: last.tick + STEP, close: 10.8 };
      await show([...current.slice(0, -1), finished, next]);
      expect(setData).not.toHaveBeenCalled();
      expect(update.mock.calls.map(([point]) => point.close)).toEqual([11, 10.8]);
    });

    it('keeps the view the user zoomed to while candles come in', async () => {
      wheel(canvas(), -100);
      await settle(fixture);
      const view = ranges.at(-1);
      const current = fixture.componentInstance.candles();
      const last = current[current.length - 1];
      await show([...current.slice(0, -1), { ...last, close: 10.9 }]);
      expect(ranges.at(-1)).toEqual(view);
    });

    it('sets other data again and fits it', async () => {
      const { setData, update } = priceSeries();
      setData.mockClear();
      await show(candles(start + 10 * TICKS_PER_DAY, 40));
      expect(setData).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
      expect(ranges.at(-1)?.from).toBe(start + 10 * TICKS_PER_DAY);
    });

    it('shows weekly candles from before the epoch', async () => {
      const weeks = Array.from({ length: 10 }, (_, index) => ({
        tick: -2 * TICKS_PER_DAY + index * 7 * TICKS_PER_DAY,
        open: 10,
        high: 11,
        low: 9,
        close: 10,
      }));
      await show(weeks);
      expect(ranges.at(-1)?.from).toBe(-2_880);
    });
  });

  describe('chart type', () => {
    it('replaces the series for another chart type', async () => {
      fixture.componentRef.setInput('chartType', 'area');
      await settle(fixture);
      expect(calls.removeSeries).toHaveBeenCalledWith(calls.series[0].series);
      expect(calls.series[1].series.seriesType()).toBe('Area');
      expect(calls.series[1].setData.mock.lastCall?.[0]).toHaveLength(130);
    });
  });

  describe('theme', () => {
    it('sets the token colours again when the theme changes', async () => {
      expect(calls.chart?.options().layout.background).toMatchObject({ color: '#ffffff' });
      document.documentElement.style.setProperty('--pgo-surface', '#121821');
      document.documentElement.style.setProperty('--pgo-up', '#26c281');
      document.documentElement.classList.add('dark');
      await settle(fixture);
      expect(calls.chart?.options().layout.background).toMatchObject({ color: '#121821' });
      expect(priceSeries().series.options()).toMatchObject({ upColor: '#26c281' });
    });
  });

  describe('overlays', () => {
    const points = (count: number, value = 10): Array<{ tick: number; value: number }> =>
      Array.from({ length: count }, (_, index) => ({ tick: start + index * STEP, value }));

    it('draws an overlay line and updates its newest point incrementally', async () => {
      fixture.componentRef.setInput('overlays', [
        { id: 'sma', points: points(130), color: 'chart-1' },
      ]);
      await settle(fixture);
      const overlay = calls.series[1];
      expect(overlay.setData.mock.lastCall?.[0]).toHaveLength(130);
      const next = [...points(129), { tick: start + 129 * STEP, value: 12 }];
      fixture.componentRef.setInput('overlays', [{ id: 'sma', points: next, color: 'chart-1' }]);
      await settle(fixture);
      expect(overlay.setData).toHaveBeenCalledTimes(1);
      expect(overlay.update.mock.lastCall?.[0]).toMatchObject({ value: 12 });
      fixture.componentRef.setInput('overlays', []);
      await settle(fixture);
      expect(calls.removeSeries).toHaveBeenCalledWith(overlay.series);
    });
  });

  describe('scrolledToStart', () => {
    it('stays quiet for the fitted view of new data sets', async () => {
      await show(candles(start + 10 * TICKS_PER_DAY, 35));
      await show(candles(start, 130));
      expect(requests).toBe(0);
    });

    it('asks once per data set when the user zooms out at the oldest candle', async () => {
      wheel(canvas(), 100);
      await settle(fixture);
      wheel(canvas(), 100);
      await settle(fixture);
      expect(requests).toBe(1);
    });

    it('keeps the view when older candles come in front', async () => {
      wheel(canvas(), 100);
      await settle(fixture);
      const current = fixture.componentInstance.candles();
      await show([...candles(start - 130 * STEP, 130), ...current]);
      // A refitted view would start at the oldest candle again and ask for the next block.
      expect(requests).toBe(1);
    });

    it('asks again when the view is still at the start after a small block', async () => {
      wheel(canvas(), 100);
      await settle(fixture);
      const current = fixture.componentInstance.candles();
      await show([...candles(start - 3 * STEP, 3), ...current]);
      expect(requests).toBe(2);
    });

    it('needs a new gesture after a new data set', async () => {
      wheel(canvas(), 100);
      await settle(fixture);
      await show(candles(start + 10 * TICKS_PER_DAY, 130));
      expect(requests).toBe(1);
      wheel(canvas(), 100);
      await settle(fixture);
      expect(requests).toBe(2);
    });
  });
});
