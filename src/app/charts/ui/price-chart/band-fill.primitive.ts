import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';

import { PriceChartOverlayPoint } from './price-chart.model';
import { tickToChartTime } from './price-chart.utils';

type RenderTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

/** A point of the band in media coordinates: x and the y of both lines. */
interface BandCoordinate {
  x: number;
  upper: number;
  lower: number;
}

/**
 * Fills the area between the line of its series and a second line with the same ticks (e.g. the
 * Bollinger bands, TS §11.7). A series primitive of lightweight-charts, drawn below the series, so
 * that candles and lines stay on top of the fill. Points whose ticks differ or that lie outside
 * the scales are skipped.
 */
export class BandFillPrimitive implements ISeriesPrimitive<Time> {
  #attached?: SeriesAttachedParameter<Time>;
  #upper: readonly PriceChartOverlayPoint[] = [];
  #lower: readonly PriceChartOverlayPoint[] = [];
  #color = '';

  readonly #renderer: IPrimitivePaneRenderer = { draw: (target) => this.#draw(target) };
  readonly #views: readonly IPrimitivePaneView[] = [
    { zOrder: () => 'bottom', renderer: () => this.#renderer },
  ];

  /** The two lines and the fill colour (CSS colour with alpha); redraws the chart. */
  setData(
    upper: readonly PriceChartOverlayPoint[],
    lower: readonly PriceChartOverlayPoint[],
    color: string,
  ): void {
    this.#upper = upper;
    this.#lower = lower;
    this.#color = color;
    this.#attached?.requestUpdate();
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.#attached = param;
  }

  detached(): void {
    this.#attached = undefined;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.#views;
  }

  #coordinates(): BandCoordinate[] {
    const attached = this.#attached;
    if (attached === undefined) {
      return [];
    }
    const { chart, series } = attached;
    const timeScale = chart.timeScale();
    const count = Math.min(this.#upper.length, this.#lower.length);
    const coordinates: BandCoordinate[] = [];
    for (let index = 0; index < count; index++) {
      const upperPoint = this.#upper[index];
      const lowerPoint = this.#lower[index];
      if (upperPoint.tick !== lowerPoint.tick) {
        continue;
      }
      const x = timeScale.timeToCoordinate(tickToChartTime(upperPoint.tick) as UTCTimestamp);
      const upper = series.priceToCoordinate(upperPoint.value);
      const lower = series.priceToCoordinate(lowerPoint.value);
      if (x !== null && upper !== null && lower !== null) {
        coordinates.push({ x, upper, lower });
      }
    }
    return coordinates;
  }

  #draw(target: RenderTarget): void {
    const coordinates = this.#coordinates();
    if (coordinates.length < 2 || this.#color === '') {
      return;
    }
    target.useMediaCoordinateSpace(({ context }) => {
      context.beginPath();
      context.moveTo(coordinates[0].x, coordinates[0].upper);
      for (let index = 1; index < coordinates.length; index++) {
        context.lineTo(coordinates[index].x, coordinates[index].upper);
      }
      for (let index = coordinates.length - 1; index >= 0; index--) {
        context.lineTo(coordinates[index].x, coordinates[index].lower);
      }
      context.closePath();
      context.fillStyle = this.#color;
      context.fill();
    });
  }
}
