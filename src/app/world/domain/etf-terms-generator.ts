import { drawDividendSchedule } from './dividend-schedule-generator';
import { EtfDraft } from './etf-generator';
import { lognormalIn } from './generator.utils';
import { Etf } from './models/etf.model';
import { DIVIDENDS_PER_YEAR } from './models/taxonomy.model';
import { EtfConfig } from './models/world-config.model';

import { CENTS_PER_EURO } from '../../shared/domain/models/money.model';
import { roundHalfAwayFromZero } from '../../shared/domain/money-logic';
import { RandomStream } from '../../simulation/util/random-stream';

/**
 * Draws the start price (NAV at the epoch) of every ETF and the ex-date rhythm of the distributing
 * ones in ETF order (TS §5.6). Uses its own stream, so the other ETF attributes do not move.
 */
export function assignEtfTerms(
  rng: RandomStream,
  drafts: readonly EtfDraft[],
  config: EtfConfig,
): Etf[] {
  return drafts.map((draft) => {
    const startPrice =
      roundHalfAwayFromZero(lognormalIn(rng, config.startPrice) * CENTS_PER_EURO) / CENTS_PER_EURO;
    const { distribution } = draft;
    if (distribution.kind === 'accumulating') {
      return { ...draft, distribution, startPrice };
    }
    const schedule = drawDividendSchedule(rng, DIVIDENDS_PER_YEAR[distribution.frequency]);
    return { ...draft, distribution: { ...distribution, schedule }, startPrice };
  });
}
