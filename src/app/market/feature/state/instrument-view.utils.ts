import { Dictionary } from '@ngrx/entity';

import { CHART_COLORS } from '@app/charts/ui/models/chart-color.model';
import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { exchangeStatus, regionStatus } from '@app/clock/domain/exchange-status-logic';
import { ExchangeStatus } from '@app/clock/domain/models/exchange-status.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { ExchangeInfo } from '@app/engine/data-access/service/engine-service.model';
import { EngineCommandError } from '@app/engine/data-access/service/engine.service';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import {
  CompositionShare,
  DividendPayment,
  IndexComposition,
  InstrumentDividends,
  InstrumentFigures,
  UpcomingDividend,
} from '@app/market/domain/models/instrument-figures.model';
import { Instrument, InstrumentDetails } from '@app/market/domain/models/instrument.model';
import {
  CompositionSegmentView,
  CompositionView,
  DividendDateView,
  DividendsView,
  InstrumentFiguresView,
  InstrumentHeadView,
  InstrumentLink,
  InstrumentProfileView,
} from '@app/market/ui/models/instrument-view.model';
import { priceDecimals } from '@app/shared/domain/price-step-logic';

import { InstrumentDetailState, InstrumentDetailView } from './market.model';

/** Coloured donut segments; the rest beyond them is one segment `other` in the last colour. */
const DONUT_SEGMENTS = CHART_COLORS.length;

/** The engine doesn't know the instrument (TS §8.2): the page shows "not found", no toast. */
export function isUnknownInstrument(error: unknown): boolean {
  return error instanceof EngineCommandError && error.code === 'unknown-instrument';
}

/**
 * Trading status of the instrument page (US-MK-03, US-MK-05): shares and ETFs that of their
 * exchange; indices that of the exchanges of their region (all exchanges for global indices),
 * open while one of them is. `null` without exchanges or clock.
 */
export function instrumentStatus(
  instrument: Instrument,
  exchanges: readonly ExchangeInfo[] | null,
  tick: Tick | null,
): ExchangeStatus | null {
  if (exchanges === null || tick === null) {
    return null;
  }
  if (instrument.kind === 'index') {
    const sessions = exchanges.filter(
      (exchange) => instrument.regionId === null || exchange.regionId === instrument.regionId,
    );
    return regionStatus(sessions, tick);
  }
  const exchange = exchanges.find((candidate) => candidate.id === instrument.exchangeId);
  return exchange === undefined ? null : exchangeStatus(exchange, tick);
}

/** The price head with the live quote; spread absolute and relative to the middle (US-MK-03). */
export function instrumentHeadView(
  instrument: Instrument,
  quote: SeriesQuote | null,
  exchanges: readonly ExchangeInfo[] | null,
  tick: Tick | null,
  detail: InstrumentDetailState,
): InstrumentHeadView {
  const bid = quote?.bid ?? null;
  const ask = quote?.ask ?? null;
  const spread = bid !== null && ask !== null ? ask - bid : null;
  const middle = bid !== null && ask !== null ? (ask + bid) / 2 : null;
  const figures = detail.figures?.id === instrument.id ? detail.figures : null;
  const etf = instrument.kind === 'etf' && figures !== null;
  return {
    id: instrument.id,
    kind: instrument.kind,
    name: instrument.name,
    ticker: instrument.ticker,
    isin: instrument.isin,
    exchangeName:
      exchanges?.find((exchange) => exchange.id === instrument.exchangeId)?.name ?? null,
    last: quote?.last ?? null,
    bid,
    ask,
    spread,
    spreadRatio: spread !== null && middle !== null && middle > 0 ? spread / middle : null,
    change: quote?.change ?? null,
    changeRatio: quote?.changeRatio ?? null,
    priceDecimals: quote === null ? 2 : priceDecimals(quote.last),
    status: instrumentStatus(instrument, exchanges, tick),
    indicativeValue: etf ? figures.indicativeValue : null,
    indicativeTick: etf ? detail.figuresTick : null,
  };
}

/** Key figures: market capitalisation for shares, the fund volume (in euros) for ETFs. */
export function instrumentFiguresView(
  instrument: Instrument,
  figures: InstrumentFigures,
): InstrumentFiguresView {
  return {
    kind: instrument.kind,
    size: instrument.kind === 'etf' ? instrument.fundVolume / 100 : figures.marketCap,
    dividendYield: figures.dividendYield,
    volatility: figures.volatility,
    beta: figures.beta,
    performance: figures.performance,
  };
}

function link(entities: Dictionary<Instrument>, id: string): InstrumentLink | null {
  const instrument = entities[id];
  return instrument === undefined ? null : { id, name: instrument.name };
}

/** Profile of a share, ETF or index from the master data and the details. */
export function instrumentProfileView(
  instrument: Instrument,
  details: InstrumentDetails,
  entities: Dictionary<Instrument>,
): InstrumentProfileView | null {
  if (instrument.kind === 'stock' && details.kind === 'stock') {
    return {
      kind: 'stock',
      sectorId: instrument.sectorId,
      industryId: instrument.industryId,
      countryId: instrument.countryId,
      size: instrument.size,
      style: instrument.style,
      riskClass: instrument.riskClass,
      profile: details.profile,
      foundedYear: details.foundedYear,
      employees: details.employees,
      freeFloat: details.freeFloatShares / details.sharesOutstanding,
      indices: details.indexIds.flatMap((id) => link(entities, id) ?? []),
    };
  }
  if (instrument.kind === 'etf' && details.kind === 'etf') {
    return {
      kind: 'etf',
      index: link(entities, instrument.indexId),
      ter: instrument.ter,
      distribution: instrument.distribution,
      distributionFrequency: instrument.distributionFrequency,
      replication: instrument.replication,
      issuerName: instrument.issuerName,
      fundVolume: instrument.fundVolume / 100,
    };
  }
  if (instrument.kind === 'index' && details.kind === 'index') {
    const siblingId =
      instrument.variant === 'price' ? `${instrument.indexId}-tr` : instrument.indexId;
    return {
      kind: 'index',
      variant: instrument.variant,
      constituentCount: instrument.constituentCount,
      capWeight: details.capWeight,
      sibling: link(entities, siblingId),
    };
  }
  return null;
}

/**
 * Donut segments of a weight split (sorted descending by the engine): the first five keep their
 * colour, the rest becomes one segment `other`, so that every segment has its own colour.
 */
export function compositionSegments<T extends string>(
  shares: readonly CompositionShare<T>[],
): CompositionSegmentView<T>[] {
  const fits = shares.length <= DONUT_SEGMENTS;
  const shown = fits ? shares : shares.slice(0, DONUT_SEGMENTS - 1);
  const segments: CompositionSegmentView<T>[] = shown.map((share, index) => ({
    key: share.key,
    weight: share.weight,
    color: CHART_COLORS[index],
  }));
  if (!fits) {
    const rest = shares.slice(DONUT_SEGMENTS - 1).reduce((sum, share) => sum + share.weight, 0);
    segments.push({ key: 'other', weight: rest, color: CHART_COLORS[DONUT_SEGMENTS - 1] });
  }
  return segments;
}

export function compositionView(composition: IndexComposition): CompositionView {
  return {
    constituentCount: composition.constituentCount,
    top: composition.top.map(({ id, name, weight }) => ({ id, name, weight })),
    regions: compositionSegments(composition.regions),
    sectors: compositionSegments(composition.sectors),
  };
}

function dividendDate(payment: DividendPayment | UpcomingDividend): DividendDateView {
  return {
    exTick: dayStartTick(payment.exDay),
    paymentTick: dayStartTick(payment.paymentDay),
    cents: payment.cents,
  };
}

/** Dividends of a share or distributing ETF; accumulating ETFs have none. */
export function dividendsView(
  instrument: Instrument,
  dividends: InstrumentDividends,
): DividendsView {
  if (instrument.kind === 'etf' && instrument.distribution === 'accumulating') {
    return { kind: 'accumulating' };
  }
  return {
    kind: instrument.kind === 'etf' ? 'etf' : 'stock',
    next: dividends.next === null ? null : dividendDate(dividends.next),
    history: dividends.history.map(dividendDate),
  };
}

/** Whether the page queries the dividends of an instrument: shares and distributing ETFs. */
export function hasDividends(instrument: Instrument): boolean {
  return (
    instrument.kind === 'stock' ||
    (instrument.kind === 'etf' && instrument.distribution === 'distributing')
  );
}

/** Whether the page queries a composition: indices and ETFs (that of their index). */
export function hasComposition(instrument: Instrument): boolean {
  return instrument.kind !== 'stock';
}

/** The detail parts of the instrument page; `instrument` `null` while the master data loads. */
export function instrumentDetailView(
  instrument: Instrument | null,
  detail: InstrumentDetailState,
  entities: Dictionary<Instrument>,
): InstrumentDetailView {
  if (instrument === null) {
    return {
      notFound: detail.notFound,
      failed: detail.error !== undefined && !detail.notFound,
      figures: null,
      profile: null,
      composition: null,
      dividends: null,
    };
  }
  const { details, figures, dividends, composition } = detail;
  const profile = details === null ? null : instrumentProfileView(instrument, details, entities);
  const missing =
    profile === null ||
    figures === null ||
    (hasDividends(instrument) && dividends === null) ||
    (hasComposition(instrument) && composition === null);
  return {
    notFound: detail.notFound,
    failed: detail.error !== undefined && missing,
    figures: figures === null ? null : instrumentFiguresView(instrument, figures),
    profile,
    composition: hasComposition(instrument)
      ? composition === null
        ? null
        : compositionView(composition)
      : undefined,
    dividends:
      instrument.kind === 'index'
        ? undefined
        : instrument.kind === 'etf' && instrument.distribution === 'accumulating'
          ? { kind: 'accumulating' }
          : dividends === null
            ? null
            : dividendsView(instrument, dividends),
  };
}
