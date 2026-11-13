---
paths:
  - 'src/app/shared/**'
  - 'src/app/lab/feature/components/**'
---

# Shared building blocks: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- UI building blocks (AP 0.4) live in `shared/ui`, shown at `#/lab/components`: `appButton`/`appIconButton` (attribute directives on native `<button>`/`<a>`), `appIcon` (Bootstrap icon on `<i>`), `app-panel`, `app-badge`, `app-tabs` (Angular Aria), `appMenu`/`appMenuItem` (look of Angular Aria menus), `appNavLink` with `NavItem` (navigation lists), `app-empty-state`, `app-skeleton`, `app-stat-tile`, `app-price-change`, `ToastService`, `app-dialog` and `openConfirmDialog`. Reuse them. Tabs and menus use `@angular/aria` (E-16); everything else from the CDK.
- Infrastructure (AP 0.3): money types, rounding and price grid in `shared/domain`; formatting functions in `shared/util` (with `MISSING_VALUE` `–` and `formatOptional`) and the pipes over them in `shared/ui/pipes` and `clock/ui/pipes` (game date and time). Templates format only through these pipes. Reuse them instead of rounding or formatting ad hoc.
- Amount input `app-amount-input` (`FormValueControl<Cents | null>`) over `parseAmountInput`/`formatAmountInput` (`shared/util`); wall-clock date and time with `formatDateTime` and its pipe (AP 2.4).
- Price highlight (AP 4.4, US-MK-05): directive `appValueFlash` (`shared/ui/value-flash`, `[appValueFlash]="value"`, `[enabled]`) tints a changed number `up`/`down` for `VALUE_FLASH_MS` 600 ms, only `motion-safe:`; the first and unchanged values don't flash; example on `#/lab/components`, component test `value-flash.directive.spec.ts`. The setting that switches it off follows in AP 6.2.
