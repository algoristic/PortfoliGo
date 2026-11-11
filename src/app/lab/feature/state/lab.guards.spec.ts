import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import type { Mocked } from 'vitest';

import { LabFacade } from './lab.facade';
import { enterSimulationPage, leaveSimulationPage } from './lab.guards';

describe('lab guards', () => {
  let facade: Mocked<Pick<LabFacade, 'enterSimulationPage' | 'leaveSimulationPage'>>;
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  beforeEach(() => {
    facade = { enterSimulationPage: vi.fn(), leaveSimulationPage: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: LabFacade, useValue: facade }] });
  });

  describe('enterSimulationPage', () => {
    it('reports entering the page and allows the navigation', () => {
      const result = TestBed.runInInjectionContext(() => enterSimulationPage()(route, state));
      expect(result).toBe(true);
      expect(facade.enterSimulationPage).toHaveBeenCalled();
    });
  });

  describe('leaveSimulationPage', () => {
    it('reports leaving the page and allows the navigation', () => {
      const result = TestBed.runInInjectionContext(() =>
        leaveSimulationPage()(null, route, state, state),
      );
      expect(result).toBe(true);
      expect(facade.leaveSimulationPage).toHaveBeenCalled();
    });
  });
});
