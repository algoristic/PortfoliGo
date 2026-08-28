/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withHashLocation,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { provideRouterStore, routerReducer } from '@ngrx/router-store';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideNgRxDevTools } from './app/ngrx/utils/ngrx.providers';
import { environment } from './environments/environment';
import { provideStore } from '@ngrx/store';
import { provideIonicRouteStrategy } from './app/ionic/utils/ionic.providers';

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicRouteStrategy(),
    provideIonicAngular(),
    provideRouter(
      routes,
      withHashLocation(),
      withPreloading(PreloadAllModules),
      withComponentInputBinding(),
    ),
    provideStore({ router: routerReducer }),
    provideRouterStore(),
    provideNgRxDevTools(environment.ngrxDevToolsConfig),
  ],
});
