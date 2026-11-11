import { Provider } from '@angular/core';

import { LabSimulationService } from './lab-simulation.service';

export function provideLabSimulationService(): Provider[] {
  return [LabSimulationService];
}
