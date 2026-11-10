import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { map } from 'rxjs';

import { BOTTOM_NAV_SIZE, DESKTOP_QUERY } from './shell.page.model';

import { NavItem } from '../../ui/models/nav-item.model';
import { SectionBottomNavComponent } from '../../ui/section-bottom-nav/section-bottom-nav.component';
import { SectionHeaderComponent } from '../../ui/section-header/section-header.component';
import { PlayerMenuAction } from '../../ui/section-header/section-header.model';
import { SectionSideNavComponent } from '../../ui/section-side-nav/section-side-nav.component';
import { ShellFacade } from '../state/shell.facade';

@Component({
  selector: 'app-shell',
  imports: [
    CommonModule,
    RouterModule,
    SectionHeaderComponent,
    SectionSideNavComponent,
    SectionBottomNavComponent,
  ],
  templateUrl: './shell.page.html',
  styleUrl: './shell.page.scss',
})
export class ShellPage {
  shellFacade = inject(ShellFacade);
  readonly #breakpointObserver = inject(BreakpointObserver);
  readonly #router = inject(Router);
  // Only used as the base for relative navigation from menus, not for reading parameters.
  readonly #route = inject(ActivatedRoute);

  navItems: NavItem[] = [
    {
      path: 'dashboard',
      icon: 'grid-1x2',
      label: $localize`:@@featureShell-shellPage-navDashboard:Übersicht`,
    },
    {
      path: 'markets',
      icon: 'graph-up',
      label: $localize`:@@featureShell-shellPage-navMarkets:Märkte`,
    },
    {
      path: 'portfolio',
      icon: 'briefcase',
      label: $localize`:@@featureShell-shellPage-navPortfolio:Depot`,
    },
    {
      path: 'accounts',
      icon: 'bank',
      label: $localize`:@@featureShell-shellPage-navAccounts:Konten & Banken`,
    },
    {
      path: 'orders',
      icon: 'list-check',
      label: $localize`:@@featureShell-shellPage-navOrders:Orders`,
    },
    {
      path: 'taxes',
      icon: 'receipt',
      label: $localize`:@@featureShell-shellPage-navTaxes:Steuern`,
    },
    {
      path: 'notifications',
      icon: 'bell',
      label: $localize`:@@featureShell-shellPage-navNotifications:Benachrichtigungen`,
    },
    {
      path: 'settings',
      icon: 'gear',
      label: $localize`:@@featureShell-shellPage-navSettings:Einstellungen`,
    },
  ];
  bottomNavItems = this.navItems.slice(0, BOTTOM_NAV_SIZE);
  moreNavItems = this.navItems.slice(BOTTOM_NAV_SIZE);

  content = viewChild.required<ElementRef<HTMLElement>>('content');

  isDesktop = toSignal(
    this.#breakpointObserver.observe(DESKTOP_QUERY).pipe(map((state) => state.matches)),
    { initialValue: this.#breakpointObserver.isMatched(DESKTOP_QUERY) },
  );

  skipLinkLabel = $localize`:@@featureShell-shellPage-skipToContent:Zum Inhalt springen`;

  // A `href="#content"` link would change the hash route, so the skip link moves focus itself.
  onSkipToContent(): void {
    this.content().nativeElement.focus();
  }

  onSelectNavItem(path: string): void {
    void this.#router.navigate([path], { relativeTo: this.#route });
  }

  onSelectPlayerMenuAction(action: PlayerMenuAction): void {
    switch (action) {
      case 'switch-player':
        void this.#router.navigate(['/players']);
        break;
      case 'settings':
        void this.#router.navigate(['settings'], { relativeTo: this.#route });
        break;
      case 'export':
        // Export follows in AP 6.1; the menu item is disabled until then.
        break;
    }
  }
}
