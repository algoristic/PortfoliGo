import { fillPattern, isBlockedName, NameRegistry } from './name-logic';

import { COUNTRIES, INDUSTRIES } from './taxonomy';

import { createStream } from '../../simulation/util/random-stream';
import { deriveSeedKey } from '../../simulation/util/seed';

describe('isBlockedName', () => {
  it('blocks real names regardless of case, legal form and spacing', () => {
    expect(isBlockedName('Siemens Energy AG')).toBe(true);
    expect(isBlockedName('SIEMENS Holding SE')).toBe(true);
    expect(isBlockedName('Deutsche Bank AG')).toBe(true);
    expect(isBlockedName('Trade Republic')).toBe(true);
    expect(isBlockedName('Nestlé S.A.')).toBe(true);
  });

  it('matches short entries only as whole words', () => {
    expect(isBlockedName('SAP SE')).toBe(true);
    expect(isBlockedName('ING Direkt')).toBe(true);
    expect(isBlockedName('Sapora Software AG')).toBe(false);
    expect(isBlockedName('Velora Mining Corp.')).toBe(false);
  });

  it('matches long entries at word starts and across whole words only', () => {
    expect(isBlockedName('Siemensbank')).toBe(true);
    expect(isBlockedName('Velora Micro N.V.')).toBe(false);
    expect(isBlockedName('Ulvsiemens AG')).toBe(false);
  });

  it('allows every name part of the taxonomy and name patterns on its own', () => {
    for (const industry of INDUSTRIES) {
      for (const stem of industry.nameStems) {
        expect(isBlockedName(`Velora ${stem}`), stem).toBe(false);
      }
    }
    for (const country of COUNTRIES) {
      for (const legalForm of country.legalForms) {
        expect(isBlockedName(`Velora ${legalForm}`), legalForm).toBe(false);
      }
    }
  });
});

describe('NameRegistry', () => {
  it('never hands out a core or name twice and skips blocked names', () => {
    const rng = createStream(deriveSeedKey('names'), 'test');
    const registry = new NameRegistry();
    const cores = new Set<string>();
    const names = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const { core, name } = registry.next(rng, (value) => `${value} Bank`);
      expect(name).toBe(`${core} Bank`);
      expect(isBlockedName(name)).toBe(false);
      cores.add(core.toLowerCase());
      names.add(name);
    }
    expect(cores.size).toBe(500);
    expect(names.size).toBe(500);
  });

  it('claims additional names only once', () => {
    const registry = new NameRegistry();
    expect(registry.claim('Velora World 200')).toBe(true);
    expect(registry.claim('velora world 200')).toBe(false);
    expect(registry.claim('Siemens World 200')).toBe(false);
  });
});

describe('fillPattern', () => {
  it('inserts the core', () => {
    expect(fillPattern('Bankhaus {core}', 'Velora')).toBe('Bankhaus Velora');
  });
});
