import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { LabEffects } from './lab.effects';
import { LabFacade } from './lab.facade';
import * as fromLab from './lab.reducer';

import { provideLabSimulationService } from '../../data-access/service/lab-simulation-service.providers';

export function provideLabState(): Array<Provider | EnvironmentProviders> {
  return [
    LabFacade,
    provideState(fromLab.LAB_FEATURE_KEY, fromLab.labReducer),
    provideEffects(LabEffects),
    provideLabSimulationService(),
  ];
}
