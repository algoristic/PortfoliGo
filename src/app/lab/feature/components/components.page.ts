import { Menu, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { Dialog } from '@angular/cdk/dialog';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { apply, form, FormField } from '@angular/forms/signals';
import { RouterModule } from '@angular/router';

import { DonutComponent } from '@app/charts/ui/donut/donut.component';
import { DonutSegment } from '@app/charts/ui/donut/donut.model';
import { CHART_COLOR_BACKGROUND_CLASSES } from '@app/charts/ui/models/chart-color.model';
import { SparklineComponent } from '@app/charts/ui/sparkline/sparkline.component';
import { START_CAPITAL_RANGE } from '@app/players/domain/player-limits';
import { amountRangeSchema } from '@app/players/ui/schemas/amount-range-schema';
import { AmountInputComponent } from '@app/shared/ui/amount-input/amount-input.component';
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
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
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
    AmountInputComponent,
    BadgeComponent,
    ButtonDirective,
    DonutComponent,
    EmptyStateComponent,
    FormatNumberPipe,
    FormField,
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
    SparklineComponent,
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
  sparklineRising = [100, 101.5, 100.8, 102.4, 103.1, 102.7, 104.2];
  sparklineFalling = [104, 103.2, 103.8, 102.1, 101.4, 101.9, 100.6];
  donutSegments: DonutSegment[] = [
    { id: 'shares', value: 52, color: 'chart-1' },
    { id: 'etfs', value: 23, color: 'chart-2' },
    { id: 'bonds', value: 11, color: 'chart-3' },
    { id: 'cash', value: 8, color: 'chart-4' },
    { id: 'commodities', value: 4, color: 'chart-5' },
    { id: 'other', value: 2, color: 'chart-6' },
  ];
  swatchClasses = CHART_COLOR_BACKGROUND_CLASSES;
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
  amountModel = signal<{ amount: number | null }>({ amount: 1_000_000 });
  amountForm = form(this.amountModel, (path) => {
    apply(path.amount, amountRangeSchema(START_CAPITAL_RANGE));
  });

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
