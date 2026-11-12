import { contrastRatio } from '@app/shared/util/contrast';

import {
  BACKGROUND_TOKENS,
  ContrastRow,
  MINIMUM_TEXT_CONTRAST,
  TEXT_TOKENS,
  TokenValues,
} from './tokens.page.model';

/** Contrast of every text token on every background token; pairs with a missing value are skipped. */
export function buildContrastRows(values: TokenValues): ContrastRow[] {
  return TEXT_TOKENS.flatMap((foreground) =>
    BACKGROUND_TOKENS.flatMap((background) => {
      const fg = values[foreground];
      const bg = values[background];
      if (!fg || !bg) {
        return [];
      }
      const ratio = contrastRatio(fg, bg);
      return [{ foreground, background, ratio, passes: ratio >= MINIMUM_TEXT_CONTRAST }];
    }),
  );
}
