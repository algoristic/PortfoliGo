import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PendingTasks,
  Renderer2,
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
  LogicalRange,
  SeriesType,
  UTCTimestamp,
} from 'lightweight-charts';

import { PriceChartColors, PriceChartType } from './price-chart.model';
import {
  formatChartTime,
  formatTickMark,
  isPrepended,
  readChartColors,
  shouldRequestHistory,
  toChartCandles,
  toLinePoints,
} from './price-chart.utils';

import { Candle } from '../../../market/domain/models/candle.model';

type ChartLibrary = typeof import('lightweight-charts');

/** Events that start a scroll or zoom gesture of the user. */
const USER_MOVE_EVENTS = ['wheel', 'pointerdown', 'touchstart'] as const;

interface ChartHandle {
  library: ChartLibrary;
  chart: IChartApi;
}

/**
 * Price chart on lightweight-charts (TS §11.7, E-04), loaded lazily with a dynamic import. The
 * time axis shows game time; colours follow the `--pgo-*` tokens and change with the theme. The
 * TradingView logo stays on as the required attribution. When the user scrolls or zooms close to
 * the oldest candle, `scrolledToStart` asks for older candles; prepended candles keep the view. The
 * fitted view of a new data set starts at the oldest candle too, so only a user gesture arms it.
 */
@Component({
  selector: 'app-price-chart',
  imports: [],
  templateUrl: './price-chart.component.html',
  styleUrl: './price-chart.component.scss',
})
export class PriceChartComponent {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #renderer = inject(Renderer2);
  readonly #destroyRef = inject(DestroyRef);
  readonly #pendingTasks = inject(PendingTasks);

  candles = input.required<Candle[]>();
  chartType = input<PriceChartType>('candles');
  /** Accessible name of the chart. */
  label = input.required<string>();

  /** Emitted once per data set when the user scrolls or zooms the view to the oldest candle. */
  scrolledToStart = output<void>();

  container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  #handle = signal<ChartHandle | undefined>(undefined);
  #colors = signal<PriceChartColors | undefined>(undefined);
  #series?: ISeriesApi<SeriesType>;
  #seriesType?: PriceChartType;
  #renderedCandles: readonly Candle[] = [];
  #historyArmed = false;
  #userMoved = false;
  #destroyed = false;

  constructor() {
    this.#destroyRef.onDestroy(() => (this.#destroyed = true));
    // Capture phase: the library handles a gesture on an inner element and reports the new range
    // right away, so the gesture has to count before that.
    for (const type of USER_MOVE_EVENTS) {
      const unlisten = this.#renderer.listen(
        this.#host.nativeElement,
        type,
        () => (this.#userMoved = true),
        { capture: true, passive: true },
      );
      this.#destroyRef.onDestroy(unlisten);
    }
    // A pending task, so that `whenStable()` (tests, tooling) also waits for the lazy library.
    afterNextRender(() => this.#pendingTasks.run(() => this.#createChart()));
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
    const onVisibleRangeChange = (range: LogicalRange | null): void =>
      this.#checkHistoryStart(range);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange);
    this.#destroyRef.onDestroy(() => {
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange);
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
    const newSeries = this.#series === undefined || this.#seriesType !== chartType;
    const newCandles = candles !== this.#renderedCandles;
    // Older candles in front keep the view; any other new data set is fitted.
    const fit = newSeries || (newCandles && !isPrepended(this.#renderedCandles, candles));
    // Before `setData`: the library reports the shifted range of prepended candles right away.
    if (fit) {
      this.#userMoved = false;
    }
    if (newCandles) {
      this.#renderedCandles = candles;
      this.#historyArmed = true;
    }
    if (newSeries) {
      if (this.#series !== undefined) {
        chart.removeSeries(this.#series);
      }
      this.#series =
        chartType === 'line'
          ? chart.addSeries(library.LineSeries, { lineWidth: 2 })
          : chart.addSeries(library.CandlestickSeries, { borderVisible: false });
      this.#seriesType = chartType;
    }
    if (this.#series === undefined) {
      return;
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
    if (fit) {
      chart.timeScale().fitContent();
    }
  }

  // Only the range event carries the current view: `fitContent` applies it a frame later, prepended
  // candles and gestures right away.
  #checkHistoryStart(range: LogicalRange | null): void {
    if (
      shouldRequestHistory({
        armed: this.#historyArmed,
        userMoved: this.#userMoved,
        from: range?.from ?? null,
      })
    ) {
      this.#historyArmed = false;
      this.scrolledToStart.emit();
    }
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
