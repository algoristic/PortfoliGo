import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type {
  CandlestickData,
  DeepPartial,
  IChartApi,
  ISeriesApi,
  ChartOptions as LibraryChartOptions,
  LineData,
  SeriesType,
  UTCTimestamp,
} from 'lightweight-charts';

import { PriceChartColors, PriceChartType } from './price-chart.model';
import {
  formatChartTime,
  formatTickMark,
  readChartColors,
  toChartCandles,
  toLinePoints,
} from './price-chart.utils';

import { Candle } from '../../../market/domain/models/candle.model';

type ChartLibrary = typeof import('lightweight-charts');

interface ChartHandle {
  library: ChartLibrary;
  chart: IChartApi;
}

/**
 * Price chart on lightweight-charts (TS §11.7, E-04), loaded lazily with a dynamic import. The
 * time axis shows game time; colours follow the `--pgo-*` tokens and change with the theme. The
 * TradingView logo stays on as the required attribution.
 */
@Component({
  selector: 'app-price-chart',
  imports: [],
  templateUrl: './price-chart.component.html',
  styleUrl: './price-chart.component.scss',
})
export class PriceChartComponent {
  readonly #destroyRef = inject(DestroyRef);

  candles = input.required<Candle[]>();
  chartType = input<PriceChartType>('candles');
  /** Accessible name of the chart. */
  label = input.required<string>();

  container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  #handle = signal<ChartHandle | undefined>(undefined);
  #colors = signal<PriceChartColors | undefined>(undefined);
  #series?: ISeriesApi<SeriesType>;
  #seriesType?: PriceChartType;
  #destroyed = false;

  constructor() {
    this.#destroyRef.onDestroy(() => (this.#destroyed = true));
    afterNextRender(() => {
      void this.#createChart();
    });
    effect(() => {
      const handle = this.#handle();
      const colors = this.#colors();
      if (handle !== undefined && colors !== undefined) {
        this.#render(handle, colors, this.candles(), this.chartType());
      }
    });
  }

  async #createChart(): Promise<void> {
    const element = this.container().nativeElement;
    const root = element.ownerDocument.documentElement;
    const view = element.ownerDocument.defaultView;
    const readColors = (): PriceChartColors | undefined =>
      view ? readChartColors(view.getComputedStyle(root)) : undefined;

    const library = await import('lightweight-charts');
    if (this.#destroyed) {
      return;
    }
    const chart = library.createChart(element, {
      autoSize: true,
      localization: {
        locale: 'de-DE',
        timeFormatter: (time: unknown) => (typeof time === 'number' ? formatChartTime(time) : ''),
      },
      timeScale: {
        timeVisible: true,
        tickMarkFormatter: (time: unknown, tickMarkType: number) =>
          typeof time === 'number' ? formatTickMark(time, tickMarkType) : null,
      },
    });
    // The theme toggles the `dark` class on `<html>`; re-read the tokens when it changes.
    const observer = new MutationObserver(() => this.#colors.set(readColors()));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    this.#destroyRef.onDestroy(() => {
      observer.disconnect();
      chart.remove();
    });

    this.#colors.set(readColors());
    this.#handle.set({ library, chart });
  }

  #render(
    handle: ChartHandle,
    colors: PriceChartColors,
    candles: Candle[],
    chartType: PriceChartType,
  ): void {
    const { library, chart } = handle;
    chart.applyOptions(chartOptions(colors));
    if (this.#series === undefined || this.#seriesType !== chartType) {
      if (this.#series !== undefined) {
        chart.removeSeries(this.#series);
      }
      this.#series =
        chartType === 'line'
          ? chart.addSeries(library.LineSeries, { lineWidth: 2 })
          : chart.addSeries(library.CandlestickSeries, { borderVisible: false });
      this.#seriesType = chartType;
    }
    if (chartType === 'line') {
      this.#series.applyOptions({ color: colors.line });
      this.#series.setData(
        toLinePoints(candles).map((point): LineData => ({
          time: point.time as UTCTimestamp,
          value: point.value,
        })),
      );
    } else {
      this.#series.applyOptions({
        upColor: colors.up,
        downColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
      });
      this.#series.setData(
        toChartCandles(candles).map((candle): CandlestickData => ({
          ...candle,
          time: candle.time as UTCTimestamp,
        })),
      );
    }
    chart.timeScale().fitContent();
  }
}

function chartOptions(colors: PriceChartColors): DeepPartial<LibraryChartOptions> {
  return {
    layout: {
      background: { color: colors.background },
      textColor: colors.textMuted,
      attributionLogo: true,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    rightPriceScale: { borderColor: colors.grid },
    timeScale: { borderColor: colors.grid },
    crosshair: {
      vertLine: { labelBackgroundColor: colors.text },
      horzLine: { labelBackgroundColor: colors.text },
    },
  };
}
