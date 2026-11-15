---
paths:
  - 'src/app/shared/**'
  - 'src/app/lab/feature/components/**'
---

# Shared building blocks: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## UI building blocks (`shared/ui`, AP 0.4)

- Each has an example on `#/lab/components`: `appButton`/`appIconButton`, `appIcon`, `app-panel`, `app-badge` (never wraps, `whitespace-nowrap`), `app-tabs` and `appMenu`/`appMenuItem` (`@angular/aria`, E-16), `appNavLink` with `NavItem`, `app-empty-state`, `app-skeleton`, `app-stat-tile`, `app-price-change`, `app-amount-input`, `appValueFlash`, `app-help-hint` (see help.md), `ToastService`, `app-dialog`, `openConfirmDialog`. Everything else from the CDK.
- `app-dialog`: frame limited to the CDK pane height (`calc(100dvh - 2rem)`, `dialog.component.scss`); header and actions stay in view, content scrolls; dialogs need no own height workaround. Head and actions are `<div>`s (no `banner`/`contentinfo` landmarks in dialogs).
- `ToastService`: creates its live region at start (`app-toast-container` attached in its constructor); every toast starts with a hidden tone word („Erledigt:“, „Warnung:“, „Fehler:“, „Hinweis:“); tests read the message with `[data-testid^="toast."] p`.
- `app-amount-input`: `FormValueControl<Cents | null>` over `parseAmountInput`/`formatAmountInput` (AP 2.4).
- `appValueFlash` (`shared/ui/value-flash`, US-MK-05, AP 4.4): `[appValueFlash]="value"`, `[enabled]`; tints a changed number `up`/`down` for `VALUE_FLASH_MS` 600 ms, only `motion-safe:`; first and unchanged values don't flash. App-wide switch `VALUE_FLASH_ENABLED` (`value-flash.config.ts`, `Signal<boolean>`, root default on, fed from the device setting by `provideAppCore()`).
- `focusIfLost(injector, target)` (`shared/ui/focus`): after the next render, refocuses `target` if focus fell to `<body>` (TS §11.10).
- Global CSS: vertical CDK virtual lists give their content wrapper full width (`.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper` in `src/styles.css`), so long rows truncate instead of scrolling sideways (AP 6.8b).

## Money and formatting (AP 0.3, 4.5, 5.4, 6.3)

- `shared/domain`: money types, rounding (`money-logic.ts`), price grid (`price-step-logic.ts`).
- `shared/util/format.ts` with `MISSING_VALUE` `–` and `formatOptional`; pipes in `shared/ui/pipes` (game date/time pipes in `clock/ui/pipes`): one per `format*` function (cents, price, number, percent, their signed variants, compact, compact euros `1,2 Mrd. €`, quantity in millionths, wall-clock date-time, bytes; PS §10.4). Non-obvious: `formatSignedPrice` uses its price's decimals, `formatFixedPrice` given decimals (e.g. spread).
- Minus sign: signed formats and `formatPercent` use the typographic minus (`−12,3 %`); `formatCents`, `formatPrice`, `formatNumber` still use the hyphen-minus.
- Also `changeDirection` (`up`/`down`/`flat`), `contrastRatio` (`#/lab/tokens`).
- `shared/util/search-ranking.ts` (`normalizeSearchText`, `searchTokens`, `searchScore`, `rankSearch`, `MATCH_TIERS`; table in TS §11.4) ranks the command palette and the glossary search (AP 6.5).

## Locale (AP 6.8a; TS §11.9, E-36)

- `shared/util/locale.ts`: `LANGUAGES`, `Language`, `DEFAULT_LANGUAGE`, `FORMAT_LOCALES` (`de-DE`/`en-GB`), `setFormatLanguage` (only `main.ts` and tests), `formatLanguage`, `formatLocale`, `numberSeparators`, `perLocale(create)` (cached Intl formats per locale).
- Never write `'de-DE'` or module-level `Intl` formats; use `perLocale` so formats follow the language. English table in TS §11.9 (`€1,234.56`, `2.50%`, `1.2m`, `12/11/2026, 14:30`). `parseAmountInput(text, separators?)` reads `1,234.56` in English and rejects the German form there.
- Translations: `src/locale/messages.en.xlf` → `src/assets/i18n/messages.en.json` (`tools/i18n.mjs`).

## Ports and services (`shared/data-access`)

- `FILE_DOWNLOAD` (`file-download/file-download.ts`, root default: `Blob` URL + temporary link) saves text as a download; test double `RecordingFileDownload`/`provideRecordingFileDownload` (AP 6.1). The CDK `Clipboard` copies only during a user action, so copy in the click handler itself.
- `APP_RELOAD` (`app-reload/app-reload.ts`, root default `location.reload()`); test double `RecordingAppReload` (AP 6.8a).
- `ColorSchemeService`: light/dark, `applyChangeColors` toggles `colors-blue-orange` on `<html>` (`CHANGE_COLORS`, `BLUE_ORANGE_CLASS` in `color-scheme-service.utils.ts`), sets the `theme-color` meta from the computed `--pgo-bg` (AP 6.2, 6.3).
- Change colours in `src/styles.css`: both gain/loss pairs per theme (`--pgo-up-green-red` … `--pgo-down-blue-orange`); `--pgo-up`/`--pgo-down` point at the pair chosen by `.colors-blue-orange`/`.colors-green-red` above the theme class; `#/lab/tokens` measures all four combinations.
