import { createMarketLayout, LOADINGS_PER_INSTRUMENT } from './market-layout';

import { deriveSeedKey } from '../../simulation/util/seed';
import { generateWorld } from '../../world/domain/world-generator';

describe('createMarketLayout', () => {
  const world = generateWorld(deriveSeedKey('golden-1'));
  const layout = createMarketLayout(world);

  it('orders the factors world, regions, sectors, industries, style, size', () => {
    expect(layout.factorIds).toHaveLength(1 + 4 + 11 + world.industries.length + 2);
    expect(layout.factorIds[0]).toBe('world');
    expect(layout.factorIds[1]).toBe('region:north-america');
    expect(layout.factorIds.slice(-2)).toEqual(['style', 'size']);
    expect(new Set(layout.factorIds).size).toBe(layout.factorIds.length);
  });

  it('puts the support points at midnight and at every open and close', () => {
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
