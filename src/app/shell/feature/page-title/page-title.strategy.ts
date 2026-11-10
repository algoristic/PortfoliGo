import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { formatPageTitle } from './page-title.utils';

/** Sets the document title from the route `title`, e.g. `Märkte · PortfoliGo`. */
@Injectable()
export class PageTitleStrategy extends TitleStrategy {
  readonly #title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.#title.setTitle(formatPageTitle(this.buildTitle(snapshot)));
  }
}
