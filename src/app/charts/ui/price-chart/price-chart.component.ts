import {
  afterNextRender,
  Component,
  computed,
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
  IRange,
  ISeriesApi,
  ChartOptions as LibraryChartOptions,
  LineData,
  LogicalRange,
  MouseEventParams,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';

import { Candle } from '@app/market/domain/models/candle.model';
import { priceDecimals } from '@app/shared/domain/price-step-logic';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { formatNumber } from '@app/shared/util/format';

import { PRICE_CHART_LIBRARY, PriceChartLibrary } from './price-chart.config';
import {
  PriceChartColors,
  PriceChartCrosshair,
  PriceChartOverlay,
  PriceChartOverlayPoint,
  PriceChartRange,
  PriceChartType,
} from './price-chart.model';
import {
  candleAt,
  chartTimeToTick,
  formatChartTime,
  formatTickMark,
  incrementalUpdates,
  isPrepended,
  readChartColors,
  shouldRequestHistory,
  tickToChartTime,
  toChartCandle,
  toLinePoint,
} from './price-chart.utils';

/** Events that start a scroll or zoom gesture of the user. */
const USER_MOVE_EVENTS = ['wheel', 'pointerdown', 'touchstart'] as const;

/** Opacity of the area fill below the line (hex alpha appended to the token colour). */
const AREA_TOP_ALPHA = '66';
const AREA_BOTTOM_ALPHA = '00';

interface ChartHandle {
  library: PriceChartLibrary;
  chart: IChartApi;
}

interface OverlaySeries {
  series: ISeriesApi<'Line'>;
  overlay: PriceChartOverlay;
}

function samePoint(a: PriceChartOverlayPoint, b: PriceChartOverlayPoint): boolean {
  return a.tick === b.tick && a.value === b.value;
}

function overlayPoint(point: PriceChartOverlayPoint): LineData {
  return { time: tickToChartTime(point.tick) as UTCTimestamp, value: point.value };
}

/**
 * Price chart on lightweight-charts (TS §11.7, E-04), loaded lazily through `PRICE_CHART_LIBRARY`.
 * The time axis shows game time, prices use the German number format; colours follow the `--pgo-*` tokens and change with the theme.
 * The TradingView logo stays on as the required attribution. New candles that only change or add
 * the newest one go to `series.update`, everything else to `setData`. When the user scrolls or
 * zooms close to the oldest candle, `scrolledToStart` asks for older candles; prepended candles
 * keep the view. The fitted view of a new data set starts at the oldest candle too, so only a user
 * gesture arms it. `autoSize` follows the host size with a `ResizeObserver`; destroying the
 * component removes the chart.
 */
@Component({
  selector: 'app-price-chart',
  imports: [SkeletonComponent],
  templateUrl: './price-chart.component.html',
  host: {
    class: 'relative block',
    '[attr.data-candle-count]': 'candles().length',
    '[attr.data-last-tick]': 'lastTick()',
  },
})
export class PriceChartComponent {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #renderer = inject(Renderer2);
  readonly #destroyRef = inject(DestroyRef);
  readonly #pendingTasks = inject(PendingTasks);
  readonly #loadLibrary = inject(PRICE_CHART_LIBRARY);

  candles = input.required<readonly Candle[]>();
  chartType = input<PriceChartType>('candles');
  overlays = input<readonly PriceChartOverlay[]>([]);
  /** Shows a placeholder over the chart while candles load. */
  loading = input(false);
  /** Accessible name of the chart. */
  label = input.required<string>();

  /** Emitted once per data set when the user scrolls or zooms the view to the oldest candle. */
  scrolledToStart = output<void>();
  /** The visible period after every change of the view. */
  changedVisibleRange = output<PriceChartRange | null>();
  /** The candle under the crosshair, `null` when it leaves the data. */
  movedCrosshair = output<PriceChartCrosshair | null>();

  container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  lastTick = computed(() => this.candles().at(-1)?.tick ?? null);

  #handle = signal<ChartHandle | undefined>(undefined);
  #colors = signal<PriceChartColors | undefined>(undefined);
  #series?: ISeriesApi<SeriesType>;
  #seriesType?: PriceChartType;
  #seriesColors?: PriceChartColors;
  #renderedCandles: readonly Candle[] = [];
  #overlaySeries = new Map<string, OverlaySeries>();
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
    effect(() => {
      const handle = this.#handle();
      const colors = this.#colors();
      if (handle !== undefined && colors !== undefined) {
        this.#renderOverlays(handle, colors, this.overlays());
      }
    });
  }

  async #createChart(): Promise<void> {
    const element = this.container().nativeElement;
    const root = element.ownerDocument.documentElement;
    const view = element.ownerDocument.defaultView;
    const readColors = (): PriceChartColors | undefined =>
      view ? readChartColors(view.getComputedStyle(root)) : undefined;

    const library = await this.#loadLibrary();
    if (this.#destroyed) {
      return;
    }
    const chart = library.createChart(element, {
      autoSize: true,
      localization: {
        locale: 'de-DE',
        timeFormatter: (time: unknown) => (typeof time === 'number' ? formatChartTime(time) : ''),
        priceFormatter: (price: number) => formatNumber(price, priceDecimals(price)),
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
    const onLogicalRangeChange = (range: LogicalRange | null): void =>
      this.#checkHistoryStart(range);
    const onTimeRangeChange = (range: IRange<Time> | null): void =>
      this.changedVisibleRange.emit(
        range === null
          ? null
          : {
              from: chartTimeToTick(range.from as number),
              to: chartTimeToTick(range.to as number),
            },
      );
    const onCrosshairMove = (event: MouseEventParams<Time>): void => this.#reportCrosshair(event);
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(onLogicalRangeChange);
    timeScale.subscribeVisibleTimeRangeChange(onTimeRangeChange);
    chart.subscribeCrosshairMove(onCrosshairMove);
    this.#destroyRef.onDestroy(() => {
      observer.disconnect();
      timeScale.unsubscribeVisibleLogicalRangeChange(onLogicalRangeChange);
      timeScale.unsubscribeVisibleTimeRangeChange(onTimeRangeChange);
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      this.#series = undefined;
      this.#overlaySeries.clear();
    });

    this.#colors.set(readColors());
    this.#handle.set({ library, chart });
  }

  #render(
    handle: ChartHandle,
    colors: PriceChartColors,
    candles: readonly Candle[],
    chartType: PriceChartType,
  ): void {
    const { library, chart } = handle;
    const newColors = colors !== this.#seriesColors;
    if (newColors) {
      chart.applyOptions(chartOptions(colors));
    }
    const newSeries = this.#series === undefined || this.#seriesType !== chartType;
    const previous = this.#renderedCandles;
    const updates = newSeries ? null : incrementalUpdates(previous, candles);
    // Older candles in front keep the view; any other new data set is fitted.
    const fit = newSeries || (updates === null && !isPrepended(previous, candles));
    // Before `setData`: the library reports the shifted range of prepended candles right away.
    if (fit) {
      this.#userMoved = false;
    }
    if (candles !== previous && (updates === null || updates.length > 0)) {
      this.#historyArmed = true;
    }
    this.#renderedCandles = candles;
    if (newSeries) {
      if (this.#series !== undefined) {
        chart.removeSeries(this.#series);
      }
      this.#series = addPriceSeries(chart, library, chartType);
      this.#seriesType = chartType;
    }
    const series = this.#series;
    if (series === undefined) {
      return;
    }
    if (newSeries || newColors) {
      series.applyOptions(seriesColors(chartType, colors));
      this.#seriesColors = colors;
    }
    if (chartType === 'candles') {
      writeSeries(series as ISeriesApi<'Candlestick'>, candlestickPoint, candles, updates);
    } else {
      writeSeries(series as ISeriesApi<'Line'>, linePoint, candles, updates);
    }
    if (fit) {
      chart.timeScale().fitContent();
    }
  }

  #renderOverlays(
    { library, chart }: ChartHandle,
    colors: PriceChartColors,
    overlays: readonly PriceChartOverlay[],
  ): void {
    const wanted = new Set(overlays.map((overlay) => overlay.id));
    for (const [id, { series }] of this.#overlaySeries) {
      if (!wanted.has(id)) {
        chart.removeSeries(series);
        this.#overlaySeries.delete(id);
      }
    }
    for (const overlay of overlays) {
      const color = colors.categories[overlay.color];
      const current = this.#overlaySeries.get(overlay.id);
      if (current === undefined) {
        const series = chart.addSeries(library.LineSeries, {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(overlay.points.map(overlayPoint));
        this.#overlaySeries.set(overlay.id, { series, overlay });
        continue;
      }
      current.series.applyOptions({ color });
      if (current.overlay.points !== overlay.points) {
        const updates = incrementalUpdates(current.overlay.points, overlay.points, samePoint);
        if (updates === null) {
          current.series.setData(overlay.points.map(overlayPoint));
        } else {
          updates.forEach((point) => current.series.update(overlayPoint(point)));
        }
      }
      current.overlay = overlay;
    }
  }

  #reportCrosshair(event: MouseEventParams<Time>): void {
    const candle =
      typeof event.time === 'number'
        ? candleAt(this.#renderedCandles, chartTimeToTick(event.time))
        : undefined;
    if (candle === undefined) {
      this.movedCrosshair.emit(null);
      return;
    }
    const overlays: PriceChartCrosshair['overlays'] = [];
    for (const [id, { series }] of this.#overlaySeries) {
      const data = event.seriesData.get(series);
      if (data !== undefined && 'value' in data) {
        overlays.push({ id, value: data.value });
      }
    }
    this.movedCrosshair.emit({ candle, overlays });
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

function addPriceSeries(
  chart: IChartApi,
  library: PriceChartLibrary,
  chartType: PriceChartType,
): ISeriesApi<SeriesType> {
  switch (chartType) {
    case 'line':
      return chart.addSeries(library.LineSeries, { lineWidth: 2 });
    case 'area':
      return chart.addSeries(library.AreaSeries, { lineWidth: 2 });
    default:
      return chart.addSeries(library.CandlestickSeries, { borderVisible: false });
  }
}

function seriesColors(chartType: PriceChartType, colors: PriceChartColors): object {
  switch (chartType) {
    case 'line':
      return { color: colors.line };
    case 'area':
      return {
        lineColor: colors.line,
        topColor: colors.line + AREA_TOP_ALPHA,
        bottomColor: colors.line + AREA_BOTTOM_ALPHA,
      };
    default:
      return {
        upColor: colors.up,
        downColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
      };
  }
}

/** `update` for incremental changes, otherwise `setData` with all candles. */
function writeSeries<T>(
  series: { setData(data: T[]): void; update(data: T): void },
  point: (candle: Candle) => T,
  candles: readonly Candle[],
  updates: Candle[] | null,
): void {
  if (updates === null) {
    series.setData(candles.map(point));
  } else {
    updates.forEach((candle) => series.update(point(candle)));
  }
}

function linePoint(candle: Candle): LineData {
  const { time, value } = toLinePoint(candle);
  return { time: time as UTCTimestamp, value };
}

function candlestickPoint(candle: Candle): CandlestickData {
  const point = toChartCandle(candle);
  return { ...point, time: point.time as UTCTimestamp };
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
