import { BidAsk } from './models/quote.model';

/** Tick size of the price grid (TS §6.7). */
export function priceStep(price: number): number {
  return 1 / priceStepsPerEuro(price);
}

/** Number of decimal places of the price grid at this price. */
export function priceDecimals(price: number): number {
  const abs = Math.abs(price);
  if (abs >= 10) {
    return 2;
  }
  return abs >= 1 ? 3 : 4;
}

export function roundDownToStep(price: number, step: number): number {
  const stepsPerEuro = Math.round(1 / step);
  return Math.floor(toSteps(price, stepsPerEuro)) / stepsPerEuro;
}

export function roundUpToStep(price: number, step: number): number {
  const stepsPerEuro = Math.round(1 / step);
  return Math.ceil(toSteps(price, stepsPerEuro)) / stepsPerEuro;
}

/**
 * Bid and ask around a mid price for a relative spread (`0.001` = 0.1 %). The bid is rounded
 * down and the ask up to the price grid of the mid price, at least one step apart.
 */
export function bidAsk(mid: number, spread: number): BidAsk {
  const stepsPerEuro = priceStepsPerEuro(mid);
  const bidSteps = Math.floor(toSteps(mid * (1 - spread / 2), stepsPerEuro));
  const askSteps = Math.max(Math.ceil(toSteps(mid * (1 + spread / 2), stepsPerEuro)), bidSteps + 1);
  return { bid: bidSteps / stepsPerEuro, ask: askSteps / stepsPerEuro };
}

function priceStepsPerEuro(price: number): number {
  return 10 ** priceDecimals(price);
}

// Reduced to 15 significant digits so that e.g. `8.002 * 1000` does not floor to 8001.
function toSteps(price: number, stepsPerEuro: number): number {
  return Number((price * stepsPerEuro).toPrecision(15));
}
