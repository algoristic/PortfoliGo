---
paths:
  - 'src/app/about/**'
---

# About: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Legal notes and licences (AP 6.5, 6.8b; US-UI-08, E-26, TS §11.4)

- Content component `about/ui/legal-notice`, shown by `/about` (`about/feature/about`, no game, link back to the players page) and `/game/:playerId/about` (`about/feature/game-about`, in the game frame, from the player menu and the settings).
- Content: disclaimer „Ein Spiel, keine Anlageberatung“ (`about.disclaimer`), app version (`about.app-version`, token `APP_VERSION` in `about/feature/about.config.ts`, provided only by `provideAppCore()` from `package.json`), simulation version (`about.sim-version`, `SIM_VERSION`), licences (`about.licenses`, rows `about.license.<id>.id`) and the TradingView attribution (`about.tradingview`, text from the NOTICE of `lightweight-charts`).
- `THIRD_PARTY_LICENSES` (`about/domain/third-party-licenses.ts`, model `models/third-party-license.model.ts`) lists every runtime dependency and the self-hosted fonts; `third-party-licenses.spec.ts` checks it against `package.json`, so a new runtime dependency needs an entry. Names are language-neutral (`about/domain` has no `$localize`).
- `about/ui/disclaimer-hint` (inputs `aboutLink`, `glossaryLink`): one-sentence note with links „Rechtliches und Lizenzen“ and „Glossar“ on the players page, „Spieler anlegen“ and the settings.
- Impressum and privacy notice are not built yet; they follow in M16 (public release, E-26).
- Tests: `about.page.spec.ts`; axe in `e2e/accessibility.e2e.ts`.
