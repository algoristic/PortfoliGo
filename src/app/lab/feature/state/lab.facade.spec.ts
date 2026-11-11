import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom } from 'rxjs';

import * as LabActions from './lab.actions';
import { LabFacade } from './lab.facade';
import * as LabSelectors from './lab.selectors';

describe('LabFacade', () => {
  let facade: LabFacade;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LabFacade, provideMockStore()],
    });
    facade = TestBed.inject(LabFacade);
    store = TestBed.inject(MockStore);
    vi.spyOn(store, 'dispatch');
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('busy$', () => {
    it('emits the busy flag from the store', async () => {
      store.overrideSelector(LabSelectors.selectBusy, true);
      expect(await firstValueFrom(facade.busy$)).toBe(true);
    });
  });

  describe('commands', () => {
    it('dispatches the page events', () => {
      facade.enterSimulationPage();
      facade.leaveSimulationPage();
      facade.generateWorld('lab');
      facade.simulate(30);
      facade.simulateYears(10);
      facade.computeStatistics();
      facade.changeStatisticsStart('game-start');
      facade.selectSeries(4);
      facade.changeChartOptions({ chartType: 'line' });
      facade.loadHistory();
      expect(vi.mocked(store.dispatch).mock.calls.map(([action]) => action)).toEqual([
        LabActions.enterSimulationPage(),
        LabActions.leaveSimulationPage(),
        LabActions.submittedSeed({ seed: 'lab' }),
        LabActions.clickedSimulate({ days: 30 }),
        LabActions.clickedSimulateYears({ years: 10 }),
        LabActions.clickedComputeStatistics(),
        LabActions.changedStatisticsStart({ start: 'game-start' }),
        LabActions.selectedSeries({ series: 4 }),
        LabActions.changedChartOptions({ options: { chartType: 'line' } }),
        LabActions.scrolledToChartStart(),
      ]);
    });
  });
});
