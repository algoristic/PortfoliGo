import { Menu, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { Dialog } from '@angular/cdk/dialog';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';

import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { BADGE_TONES } from '@app/shared/ui/badge/badge.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { BUTTON_VARIANTS } from '@app/shared/ui/button/button.model';
import { openConfirmDialog } from '@app/shared/ui/dialog-confirm/dialog-confirm.utils';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';
import { MenuItemDirective } from '@app/shared/ui/menu/menu-item.directive';
import { MenuDirective } from '@app/shared/ui/menu/menu.directive';
import { NavItem } from '@app/shared/ui/nav-link/nav-item.model';
import { NavLinkDirective } from '@app/shared/ui/nav-link/nav-link.directive';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';
import { StatTileComponent } from '@app/shared/ui/stat-tile/stat-tile.component';
import { TabPanelDirective } from '@app/shared/ui/tabs/tab-panel.directive';
import { TabsComponent } from '@app/shared/ui/tabs/tabs.component';
import { TabItem } from '@app/shared/ui/tabs/tabs.model';
import { TOAST_TONES, ToastTone } from '@app/shared/ui/toast/toast.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';
import { formatCents } from '@app/shared/util/format';

/** Developer page with all `shared/ui` building blocks (`#/lab/components`). */
@Component({
  selector: 'app-components-page',
  imports: [
    BadgeComponent,
    ButtonDirective,
    EmptyStateComponent,
    IconButtonDirective,
    IconDirective,
    Menu,
    MenuDirective,
    MenuItem,
    MenuItemDirective,
    MenuTrigger,
    NavLinkDirective,
    PanelComponent,
    PriceChangeComponent,
    SkeletonComponent,
    StatTileComponent,
    TabPanelDirective,
    RouterModule,
    TabsComponent,
  ],
  templateUrl: './components.page.html',
  host: { class: 'block' },
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

  icons = ['graph-up', 'briefcase', 'bank', 'bell', 'gear', 'arrow-up-right'];
  navItems: NavItem[] = [
    {
      path: '/lab/simulation',
      icon: 'graph-up',
      label: $localize`:@@featureLab-componentsPage-navSimulation:Simulation`,
    },
    {
      path: '/lab/components',
      icon: 'grid',
      label: $localize`:@@featureLab-componentsPage-navComponents:UI-Bausteine`,
    },
    {
      path: '/lab/tokens',
      icon: 'palette',
      label: $localize`:@@featureLab-componentsPage-navTokens:Design-Tokens`,
    },
  ];

  confirmResult = signal<boolean | null>(null);

  toastMessage = $localize`:@@featureLab-componentsPage-toastMessage:Beispielhinweis`;
  confirmHeading = $localize`:@@featureLab-componentsPage-confirmHeading:Spieler löschen?`;
  confirmMessage = $localize`:@@featureLab-componentsPage-confirmMessage:Der Spieler wird endgültig gelöscht.`;
  confirmLabel = $localize`:@@featureLab-componentsPage-confirmLabel:Löschen`;
  navLabel = $localize`:@@featureLab-componentsPage-navLabel:Beispielnavigation`;

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
