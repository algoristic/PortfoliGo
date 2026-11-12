import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import { Candle } from '@app/market/domain/models/candle.model';

import { PriceChartComponent } from './price-chart.component';

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

describe('PriceChartComponent', () => {
  const start = 100 * TICKS_PER_DAY;
  let fixture: ComponentFixture<PriceChartComponent>;
  let requests: number;
  let restorePlatform: () => void;

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
    fixture = TestBed.createComponent(PriceChartComponent);
    fixture.componentRef.setInput('label', 'Kursverlauf');
    requests = 0;
    fixture.componentInstance.scrolledToStart.subscribe(() => requests++);
    await show(candles(start, 130));
  });

  afterEach(() => restorePlatform());

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
