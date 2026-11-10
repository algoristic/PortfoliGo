export const CHANGE_DIRECTIONS = ['up', 'down', 'flat'] as const;
export type ChangeDirection = (typeof CHANGE_DIRECTIONS)[number];

/**
 * Direction of a change as it is displayed: values that round to zero at the given number of
 * decimal places are `flat`, so colour and arrow match the formatted text.
 */
export function changeDirection(value: number, fractionDigits = 0): ChangeDirection {
  const factor = 10 ** fractionDigits;
  const rounded = Math.round(Math.abs(value) * factor);
  if (rounded === 0 || Number.isNaN(rounded)) {
    return 'flat';
  }
  return value > 0 ? 'up' : 'down';
}
