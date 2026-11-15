---
paths:
  - 'src/app/help/**'
  - 'src/app/shared/ui/help-hint/**'
---

# Help: current state

What exists in the code, by topic. When an AP changes this area, work the change into the matching topic instead of adding a bullet per AP (projektplan §2.4).

## Glossary (AP 6.5; PS US-UI-06, TS §11.4)

- Data in `help/domain`: `GLOSSARY_TERM_IDS`, `GLOSSARY_CATEGORIES`, `GLOSSARY_TERMS` (category, `related`); invariants in `glossary.spec.ts`. Texts in `help/ui/labels/glossary-texts.ts`: `glossaryText(id)` → `term`, `keywords`, `short`, `details`; `glossaryCategoryLabel`; IDs `uiHelp-glossaryTexts-<idCamel>-…`.
- The texts follow the game's rules (TS §3, §6, §7, E-11, E-17); check them when a rule changes. A new term needs an ID, an entry in `GLOSSARY_TERMS` (grouped by category) and a case in `glossaryText`.
- `help/ui/glossary` (input `termId` = URL fragment): groups; search with `searchScore` (`shared/util/search-ranking.ts`) over term, keywords and short text, in glossary order; result count `help.glossary.result` (`role="status"`); entries `help.glossary.<id>` with `.short` and `.related.<id>` links (`[routerLink]="[]"` + fragment). The target entry gets `aria-current="location"`, scrolls into view (`scroll-mt-32`) and its `h3` takes focus; a new target clears the search.
- Pages `/help` (`help/feature/help`, `help.back`) and `/game/:playerId/help` (`help/feature/game-help`); `HelpFacade.glossaryTermId$` reads `selectFragment` of the router store (`provideHelpState()` in the routes).

## Context help

- `shared/ui/help-hint` (`app-help-hint`: inputs `term`, `text`, `link`, `fragment`, `testId`): 24 px „?“ button, CDK connected overlay with `role="dialog"`, `cdkTrapFocus` auto capture, closes on Escape/outside click/close button; test IDs `.popover`, `.text`, `.link`, `.close`.
- `help/ui/term-hint` (`<app-term-hint termId="spread">`, test IDs `help.hint.<id>…`); link from `GLOSSARY_LINK` (`term-hint/glossary-link.config.ts`, root default `/help`; `provideShellState()` provides `/game/:playerId/help`).
- Used in order ticket (order types, validity), instrument quote (spread), instrument profile (TER), account card (overdraft), lot list (FIFO), performance figures (TWR, benchmark), tax year (saver allowance, loss pot).

## Tests

- `help.page.spec.ts`, `game-help.page.spec.ts`; axe and the keyboard journey in `e2e/accessibility.e2e.ts`.
