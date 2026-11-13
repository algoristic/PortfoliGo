import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { Component, computed, ElementRef, input, signal, viewChild } from '@angular/core';

import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';

import { ExchangeStatusEntry, RegionStatusEntry } from './market-status.model';

import { exchangeChangeText, regionLabels, regionStatusText } from '../labels/region-labels';

const PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
];

/**
 * Market status of the header (PS US-ZT-01, TS §3.3): one display per region; a click opens the
 * list of all exchanges with status and next opening or closing. Open and closed differ in the
 * icon shape, not only in colour.
 */
@Component({
  selector: 'app-market-status',
  imports: [
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    CdkTrapFocus,
    IconDirective,
    IconButtonDirective,
  ],
  templateUrl: './market-status.component.html',
  host: { class: 'flex min-w-0' },
})
export class MarketStatusComponent {
  regions = input<RegionStatusEntry[]>([]);
  exchanges = input<ExchangeStatusEntry[]>([]);
  /** Only icons on phones; short names below `lg`, full names from there. */
  compact = input(false);

  positions = PANEL_POSITIONS;

  origin = viewChild.required<ElementRef<HTMLElement>>('origin');

  regionViews = computed(() =>
    this.regions().map((region) => {
      const labels = regionLabels(region.regionId);
      return {
        ...region,
        ...labels,
        statusText: `${labels.label}: ${regionStatusText(region.status)}`,
      };
    }),
  );
  exchangeViews = computed(() =>
    this.exchanges().map((exchange) => ({
      ...exchange,
      regionLabel: regionLabels(exchange.regionId).label,
      stateText: exchange.status.open ? this.openLabel : this.closedLabel,
      changeText: exchangeChangeText(exchange.status),
    })),
  );
  expanded = signal(false);

  heading = $localize`:@@uiClock-marketStatus-heading:Börsen`;
  closeLabel = $localize`:@@uiClock-marketStatus-close:Schließen`;
  openLabel = $localize`:@@uiClock-marketStatus-open:offen`;
  closedLabel = $localize`:@@uiClock-marketStatus-closed:geschlossen`;

  onToggle(): void {
    this.expanded.update((expanded) => !expanded);
  }

  onClose(): void {
    this.expanded.set(false);
  }

  // A click on the button toggles the list itself.
  onOutsideClick(event: MouseEvent): void {
    if (!(event.target instanceof Node && this.origin().nativeElement.contains(event.target))) {
      this.onClose();
    }
  }
}
