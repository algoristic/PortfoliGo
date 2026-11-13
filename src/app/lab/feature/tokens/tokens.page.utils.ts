import { contrastRatio } from '@app/shared/util/contrast';

import {
  BACKGROUND_TOKENS,
  ContrastRow,
  GRAPHIC_TOKENS,
  GraphicToken,
  MINIMUM_GRAPHIC_CONTRAST,
  MINIMUM_TEXT_CONTRAST,
  TEXT_TOKENS,
  TextToken,
  TokenValues,
} from './tokens.page.model';

/**
 * Contrast of every text token (4.5:1) and every chart colour (3:1) on every background token;
 * pairs with a missing value are skipped.
 */
export function buildContrastRows(values: TokenValues): ContrastRow[] {
  const rows = (tokens: readonly (TextToken | GraphicToken)[], minimum: number): ContrastRow[] =>
    tokens.flatMap((foreground) =>
      BACKGROUND_TOKENS.flatMap((background) => {
        const fg = values[foreground];
        const bg = values[background];
        if (!fg || !bg) {
          return [];
        }
        const ratio = contrastRatio(fg, bg);
        return [{ foreground, background, minimum, ratio, passes: ratio >= minimum }];
      }),
    );
  return [
    ...rows(TEXT_TOKENS, MINIMUM_TEXT_CONTRAST),
    ...rows(GRAPHIC_TOKENS, MINIMUM_GRAPHIC_CONTRAST),
  ];
}
