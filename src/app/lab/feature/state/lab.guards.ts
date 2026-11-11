import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn } from '@angular/router';

import { LabFacade } from './lab.facade';

export function enterSimulationPage(): CanActivateFn {
  return () => {
    inject(LabFacade).enterSimulationPage();
    return true;
  };
}

export function leaveSimulationPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(LabFacade).leaveSimulationPage();
    return true;
  };
}
