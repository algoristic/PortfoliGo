import { DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  DOCUMENT,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';

import { COLOR_SCHEMES } from '@app/shared/data-access/color-scheme/color-scheme-service.utils';

import {
  COLOR_TOKENS,
  MINIMUM_TEXT_CONTRAST,
  ThemeMeasurement,
  TokenSample,
  TokenSwatch,
  TokenValues,
} from './tokens.page.model';
import { buildContrastRows } from './tokens.page.utils';

@Component({
  selector: 'app-tokens-page',
  imports: [DecimalPipe],
  templateUrl: './tokens.page.html',
  styleUrl: './tokens.page.scss',
  host: { class: 'block' },
})
export class TokensPage {
  readonly #document = inject(DOCUMENT);

  themes = COLOR_SCHEMES;
  minimumRatio = MINIMUM_TEXT_CONTRAST;
  swatches: TokenSwatch[] = [
    { token: 'bg', swatchClass: 'bg-bg' },
    { token: 'surface', swatchClass: 'bg-surface' },
    { token: 'surface-raised', swatchClass: 'bg-surface-raised' },
    { token: 'border', swatchClass: 'bg-border' },
    { token: 'fg', swatchClass: 'bg-fg' },
    { token: 'fg-muted', swatchClass: 'bg-fg-muted' },
    { token: 'accent', swatchClass: 'bg-accent' },
    { token: 'up', swatchClass: 'bg-up' },
    { token: 'down', swatchClass: 'bg-down' },
    { token: 'warning', swatchClass: 'bg-warning' },
  ];
  samples: TokenSample[] = [
    { token: 'fg', textClass: 'text-fg' },
    { token: 'fg-muted', textClass: 'text-fg-muted' },
    { token: 'accent', textClass: 'text-accent' },
    { token: 'up', textClass: 'text-up' },
    { token: 'down', textClass: 'text-down' },
    { token: 'warning', textClass: 'text-warning' },
  ];

  panels = viewChildren<ElementRef<HTMLElement>>('panel');

  measurement = signal<ThemeMeasurement | null>(null);

  constructor() {
    afterNextRender(() => this.#measure());
  }

  #measure(): void {
    const view = this.#document.defaultView;
    if (!view) {
      return;
    }
    // Panels render in `COLOR_SCHEMES` order.
    const [dark, light] = this.panels().map((panel) => {
      const style = view.getComputedStyle(panel.nativeElement);
      const values: TokenValues = Object.fromEntries(
        COLOR_TOKENS.map((token) => [token, style.getPropertyValue(`--pgo-${token}`).trim()]),
      );
      return { values, rows: buildContrastRows(values) };
    });
    if (dark && light) {
      this.measurement.set({ dark, light });
    }
  }
}
