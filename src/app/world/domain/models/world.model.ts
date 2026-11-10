import { Bank } from './bank.model';
import { Company } from './company.model';
import { Etf, EtfIssuer } from './etf.model';
import { MarketIndex } from './market-index.model';
import { Country, Exchange, Industry, Region, Sector } from './taxonomy.model';

/** Everything generated from the seed; regenerated on every load, never stored (TS §5.1). */
export interface World {
  regions: readonly Region[];
  countries: readonly Country[];
  exchanges: readonly Exchange[];
  sectors: readonly Sector[];
  industries: readonly Industry[];
  companies: readonly Company[];
  indices: readonly MarketIndex[];
  etfIssuers: readonly EtfIssuer[];
  etfs: readonly Etf[];
  banks: readonly Bank[];
}
