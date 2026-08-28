import { EnvironmentProviders, Provider } from '@angular/core';
import { RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy } from '@ionic/angular';

export function provideIonicRouteStrategy(): Array<Provider | EnvironmentProviders> {
  return [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }];
}
