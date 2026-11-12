import { deriveSeedKey } from '@app/simulation/util/seed';
import { REGION_IDS, SECTOR_IDS } from '@app/world/domain/models/taxonomy.model';
import { World } from '@app/world/domain/models/world.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { GOLDEN_SEED } from './golden-master';
import { createMarketLayout, LOADINGS_PER_INSTRUMENT, MarketLayout } from './market-layout';

describe('createMarketLayout', () => {
  let world: World;
  let layout: MarketLayout;

  beforeAll(() => {
    world = generateWorld(deriveSeedKey(GOLDEN_SEED));
    layout = createMarketLayout(world);
  });

  it('orders the factors world, regions, sectors, industries, style, size', () => {
    expect(layout.factorIds).toHaveLength(
      1 + REGION_IDS.length + SECTOR_IDS.length + world.industries.length + 2,
    );
    expect(layout.factorIds[0]).toBe('world');
    expect(layout.factorIds[1]).toBe('region:north-america');
    expect(layout.factorIds.slice(-2)).toEqual(['style', 'size']);
    expect(new Set(layout.factorIds).size).toBe(layout.factorIds.length);
  });

  it('puts the support points at midnight and at every open and close', () => {
    // TS §3.3: Asia-Pacific 01:00–07:00, India 04:45–11:00, Europe 09:00–17:30,
    // Brazil 14:00–21:00, North America 15:30–22:00 (minutes of the day).
    expect(Array.from(layout.boundaries)).toEqual([
      0, 60, 285, 420, 540, 660, 840, 930, 1050, 1260, 1320, 1440,
    ]);
  });

  it('maps the loadings of each company to its factors', () => {
    world.companies.forEach((company, i) => {
      const ids = Array.from(
        layout.loadingFactors.subarray(
          i * LOADINGS_PER_INSTRUMENT,
          (i + 1) * LOADINGS_PER_INSTRUMENT,
        ),
        (index) => layout.factorIds[index],
      );
      expect(ids).toEqual([
        'world',
        `region:${company.regionId}`,
        `sector:${company.sectorId}`,
        `industry:${company.industryId}`,
        'style',
        'size',
      ]);
      expect(layout.loadings[i * LOADINGS_PER_INSTRUMENT]).toBe(company.model.loadings.world);
      const exchange = world.exchanges.find((candidate) => candidate.id === company.exchangeId);
      expect(layout.boundaries[layout.openBoundary[i]]).toBe(exchange?.open);
      expect(layout.boundaries[layout.closeBoundary[i]]).toBe(exchange?.close);
    });
  });
});
