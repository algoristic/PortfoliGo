import { Provider } from '@angular/core';
import { TitleStrategy } from '@angular/router';

import { PageTitleStrategy } from './page-title.strategy';

export function providePageTitleStrategy(): Provider[] {
  return [{ provide: TitleStrategy, useClass: PageTitleStrategy }];
}
