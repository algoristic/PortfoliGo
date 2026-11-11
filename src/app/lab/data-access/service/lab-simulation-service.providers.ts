import { Provider } from '@angular/core';

import { createLabWorker, LAB_WORKER_FACTORY } from './lab-simulation-service.config';
import { LabSimulationService } from './lab-simulation.service';

export function provideLabSimulationService(): Provider[] {
  return [LabSimulationService, { provide: LAB_WORKER_FACTORY, useValue: createLabWorker }];
}
