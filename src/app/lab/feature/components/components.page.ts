import { Dialog } from '@angular/cdk/dialog';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { BADGE_TONES } from '../../../shared/ui/badge/badge.model';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { BUTTON_VARIANTS } from '../../../shared/ui/button/button.model';
import { openConfirmDialog } from '../../../shared/ui/dialog-confirm/dialog-confirm.utils';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { IconButtonDirective } from '../../../shared/ui/icon-button/icon-button.directive';
import { PanelComponent } from '../../../shared/ui/panel/panel.component';
import { PriceChangeComponent } from '../../../shared/ui/price-change/price-change.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { StatTileComponent } from '../../../shared/ui/stat-tile/stat-tile.component';
import { TabPanelDirective } from '../../../shared/ui/tabs/tab-panel.directive';
import { TabsComponent } from '../../../shared/ui/tabs/tabs.component';
import { TabItem } from '../../../shared/ui/tabs/tabs.model';
import { TOAST_TONES, ToastTone } from '../../../shared/ui/toast/toast.model';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { formatCents } from '../../../shared/util/format';

/** Developer page with all `shared/ui` building blocks (`#/lab/components`). */
@Component({
  selector: 'app-components',
  imports: [
    BadgeComponent,
    ButtonDirective,
    EmptyStateComponent,
    IconButtonDirective,
    PanelComponent,
    PriceChangeComponent,
    SkeletonComponent,
    StatTileComponent,
    TabPanelDirective,
    TabsComponent,
  ],
  templateUrl: './components.page.html',
  styleUrl: './components.page.scss',
})
export class ComponentsPage {
  readonly #toastService = inject(ToastService);
  // Dev page without a store; production code opens dialogs from effects (`CLAUDE.md` §3).
  readonly #dialog = inject(Dialog);
  readonly #destroyRef = inject(DestroyRef);

  buttonVariants = BUTTON_VARIANTS;
  badgeTones = BADGE_TONES;
  toastTones = TOAST_TONES;
  changes = [0.0129, -0.0451, 0, -0.00004];
  netWorth = formatCents(2451230);
  tabs: TabItem[] = [
    { id: 'overview', label: $localize`:@@featureLab-componentsPage-tabOverview:Übersicht` },
    { id: 'chart', label: $localize`:@@featureLab-componentsPage-tabChart:Chart` },
    { id: 'profile', label: $localize`:@@featureLab-componentsPage-tabProfile:Profil` },
  ];

  confirmResult = signal<boolean | null>(null);

  toastMessage = $localize`:@@featureLab-componentsPage-toastMessage:Beispielhinweis`;
  confirmHeading = $localize`:@@featureLab-componentsPage-confirmHeading:Spieler löschen?`;
  confirmMessage = $localize`:@@featureLab-componentsPage-confirmMessage:Der Spieler wird endgültig gelöscht.`;
  confirmLabel = $localize`:@@featureLab-componentsPage-confirmLabel:Löschen`;

  onShowToast(tone: ToastTone): void {
    this.#toastService.show(tone, `${this.toastMessage} (${tone})`);
  }

  onOpenConfirmDialog(): void {
    openConfirmDialog(this.#dialog, {
      heading: this.confirmHeading,
      message: this.confirmMessage,
      confirmLabel: this.confirmLabel,
      tone: 'danger',
    })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((confirmed) => this.confirmResult.set(confirmed));
  }
}
