/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withPreloading,
} from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { provideRouterStore, routerReducer } from '@ngrx/router-store';
import { provideStore } from '@ngrx/store';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideIndexedDb, withStorage } from './app/idb/data-access/service/idb.providers';
import { provideIonicRouteStrategy } from './app/ionic/utils/ionic.providers';
import { provideNgRxDevTools } from './app/ngrx/utils/ngrx.providers';
import { usersStorage } from './app/users/data-access/service/users-service.providers';
import { provideNewUserSettings } from './app/users/feature/create-user/create-user.providers';
import { provideUsersState } from './app/users/feature/state/users.providers';
import { environment } from './environments/environment';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  arrowForwardOutline,
  calendarOutline,
  checkmarkCircleOutline,
  close,
  informationCircleOutline,
  trashOutline,
  walletOutline,
} from 'ionicons/icons';

addIcons({
  informationCircleOutline,
  calendarOutline,
  close,
  walletOutline,
  arrowBackOutline,
  arrowForwardOutline,
  trashOutline,
});

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
    provideIndexedDb(environment.idbConfig, withStorage(usersStorage)),
    provideUsersState(),
    provideNewUserSettings(environment.newUser),
  ],
});
