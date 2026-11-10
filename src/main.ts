/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideRouterStore, routerReducer } from '@ngrx/router-store';
import { provideStore } from '@ngrx/store';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideColorSchemeService } from './app/shared/data-access/color-scheme/color-scheme-service.providers';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withHashLocation()),
    provideStore({ router: routerReducer }),
    provideRouterStore(),
    provideColorSchemeService(),
  ],
});
