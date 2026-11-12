import { detExp } from '@app/simulation/util/det-math';

/**
 * Price in euros from a log price, never below the floor (TS §6.4). Support points and minute
 * prices both go through this function.
 */
export function priceFromLog(logPrice: number, floor: number): number {
  return Math.max(floor, detExp(logPrice));
}
