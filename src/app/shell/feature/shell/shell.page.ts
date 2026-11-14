import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, effect, ElementRef, inject, Injector, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { map } from 'rxjs';

import { BankingFacade } from '@app/banking/feature/state/banking.facade';
import { ClockFacade } from '@app/clock/feature/state/clock.facade';
import { ClockControlsComponent } from '@app/clock/ui/clock-controls/clock-controls.component';
import { MarketStatusComponent } from '@app/clock/ui/market-status/market-status.component';
import { SessionFacade } from '@app/engine/feature/state/session.facade';
import { NotificationsFacade } from '@app/notifications/feature/state/notifications.facade';
import { PlayersFacade } from '@app/players/feature/state/players.facade';
import { focusIfLost } from '@app/shared/ui/focus/focus-if-lost';
import { NavItem } from '@app/shared/ui/nav-link/nav-item.model';

import { BOTTOM_NAV_SIZE, DESKTOP_QUERY } from './shell.page.model';

import { BottomNavComponent } from '../../ui/bottom-nav/bottom-nav.component';
import { HeaderComponent } from '../../ui/header/header.component';
import { PlayerMenuAction } from '../../ui/header/header.model';
import { SessionOverlayComponent } from '../../ui/session-overlay/session-overlay.component';
import { SideNavComponent } from '../../ui/side-nav/side-nav.component';
import { ShellFacade } from '../state/shell.facade';

@Component({
  selector: 'app-shell-page',
  imports: [
    CommonModule,
    RouterModule,
    HeaderComponent,
    SideNavComponent,
    BottomNavComponent,
    SessionOverlayComponent,
    ClockControlsComponent,
    MarketStatusComponent,
  ],
  templateUrl: './shell.page.html',
  host: { class: 'block' },
})
export class ShellPage {
  shellFacade = inject(ShellFacade);
  sessionFacade = inject(SessionFacade);
  clockFacade = inject(ClockFacade);
  bankingFacade = inject(BankingFacade);
  notificationsFacade = inject(NotificationsFacade);
  readonly #playersFacade = inject(PlayersFacade);
  readonly #breakpointObserver = inject(BreakpointObserver);
  readonly #injector = inject(Injector);
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
  #isReady = toSignal(this.sessionFacade.status$.pipe(map((status) => status === 'ready')), {
    initialValue: false,
  });

  skipLinkLabel = $localize`:@@featureShell-shellPage-skipToContent:Zum Inhalt springen`;
  readyLabel = $localize`:@@featureShell-shellPage-gameReady:Das Spiel ist bereit.`;

  constructor() {
    // The overlay held the focus; when it closes, the focus goes to the content like the skip link.
    let wasReady = false;
    effect(() => {
      const isReady = this.#isReady();
      if (isReady && !wasReady) {
        focusIfLost(this.#injector, () => this.content().nativeElement);
      }
      wasReady = isReady;
    });
  }

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
      case 'about':
        void this.#router.navigate(['about'], { relativeTo: this.#route });
        break;
      case 'help':
        void this.#router.navigate(['help'], { relativeTo: this.#route });
        break;
      case 'export':
        this.#playersFacade.exportPlayer();
        break;
    }
  }
}
