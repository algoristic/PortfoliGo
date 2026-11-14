---
paths:
  - 'src/app/about/**'
---

# About: current state

What exists in the code, one bullet per AP. Update it when an AP changes this area (projektplan §2.4).

- Legal notes and licences (AP 6.5, US-UI-08, E-26, TS §11.4): two pages with the same content `about/ui/legal-notice` — `/about` (`about/feature/about`, without a game, link back to the players page) and `/game/:playerId/about` (`about/feature/game-about`, inside the game frame, from the player menu and the settings). Content: „Ein Spiel, keine Anlageberatung“ (`about.disclaimer`), app version (`about.app-version`) from the token `APP_VERSION` (`about/feature/about.config.ts`, provided only by `provideAppCore()` from `package.json`), simulation version (`about.sim-version`, `SIM_VERSION`) and the licences (`about.licenses`, one row per entry `about.license.<id>.id`) with the TradingView attribution (`about.tradingview`, text from the NOTICE of `lightweight-charts`). `THIRD_PARTY_LICENSES` (`about/domain/third-party-licenses.ts`, model in `models/third-party-license.model.ts`) lists every runtime dependency and the self-hosted fonts; `third-party-licenses.spec.ts` checks it against `package.json`, so a new runtime dependency needs an entry. `about/ui/disclaimer-hint` (inputs `aboutLink`, `glossaryLink`) shows the one-sentence note with „Rechtliches und Lizenzen“ and „Glossar“ on the players page, „Spieler anlegen“ and the settings. Page test `about.page.spec.ts`; axe in `e2e/accessibility.e2e.ts`. Impressum and privacy notice are not part of AP 6.5 (PO).
