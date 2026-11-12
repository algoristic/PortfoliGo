# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Rules for implementing Angular code in this repository, so that generated code looks like code a team member would write. If a `CLAUDE.md` in a parent directory says something different, this file wins.

## Project context

**PortfoliGo** is a browser-based stock-market and personal-finance simulation game (PWA, German UI). The source of truth for what to build lives in `docs/`, and planning information lives only there:

- `docs/specs/produktspezifikation.md` (PS): vision, domain model, user stories (`US-xx-nn`), UI/UX concept.
- `docs/specs/technische-spezifikation.md` (TS): architecture, time and market model, engine, persistence, frontend architecture (§11), decisions `E-xx` (§16).
- `docs/projektplan.md`: milestones M0–M6 split into work packages (`AP x.y`), status table (§4), open decisions (§3), change log (§7).

**Session workflow:** Work happens one AP at a time ("Setze AP x.y aus `docs/projektplan.md` um"). Follow projektplan §2.3 and the Definition of Done in §2.4:

- Check that the AP's dependencies are done.
- Ask before building on a decision that is still "Vorschlag".
- Update the status and the change log.
- If the implementation deviates from the spec, update the spec.

**Current state:**

- Bootstrap: `main.ts` boots `AppComponent` with `app.config.ts`: hash router, devtools and `provideAppCore()` from `app.providers.ts` (`PageTitleStrategy`, store, effects, router store, `LOCALE_ID` `de`, colour scheme, `ToastService`), which page tests use as well.
- Routing and shell (AP 0.4): `''`/`**` → `/players`; the game area `/game/:playerId` (`shell/feature/shell.routes.ts`) lazy-loads the route files of the domains (TS §11.4). Most pages are still placeholders in their target domain folders; fill them in place. Routes set `title` via `$localize`.
- UI building blocks (AP 0.4) live in `shared/ui`, shown at `#/lab/components`: `appButton`/`appIconButton` (attribute directives on native `<button>`/`<a>`), `app-panel`, `app-badge`, `app-tabs` (Angular Aria), `app-empty-state`, `app-skeleton`, `app-stat-tile`, `app-price-change`, `ToastService`, `app-dialog` and `openConfirmDialog`. Reuse them. Tabs and menus use `@angular/aria` (E-16); everything else from the CDK.
- Infrastructure (AP 0.3): IndexedDB schema, migrations, `IndexedDbService` and `LocalStorageService` in `persistence/data-access`; money types, rounding and price grid in `shared/domain`; formatting functions in `shared/util` with pipes in `shared/ui/pipes`. Reuse them instead of rounding or formatting ad hoc.
- Determinism toolkit (AP 1.1) in `simulation/util`: `deriveSeedKey`/`normalizeSeed`, `createStream(seedKey, key)` (sfc32), distributions (`normal`, `poisson`, `weightedIndex`, `shuffle`, …), `detExp`/`detLog`, `Checksum` for golden masters and `generateSeed`. Simulation code uses these instead of `Math.random`/`Math.exp`/`Math.log`/`**`; an ESLint rule enforces this in `simulation`, `world`, `market` and `clock` (`domain`, `util`) and in `shared/domain` (money and price grid feed the simulation).
- Time model (AP 1.2) in `clock/domain`: `Tick` = game minutes since 01.01.2020, `GAME_START_TICK`, calendar functions (`tickToDateTime`, `dateTimeToTick`, `weekday`, month/year boundaries, bank working days), trading hours (`isTradingTime`, `nextOpen`, `nextClose`), `SPEEDS`, `targetTick` and `formatGameTime`/`formatGameDate`. Convert time only via the `TICKS_PER_*` constants, never with literal `60`/`1440`.
- World generation (AP 1.3) in `world/domain`: `generateWorld(seedKey, config = DEFAULT_WORLD_CONFIG)` builds the fixed taxonomy (`taxonomy.ts`) plus seed-generated companies, index and ETF master data, issuers and banks; `worldChecksum` for golden-master tests. Bank condition types live in `banking/domain/models/bank-conditions.model.ts`. Generated names go through `NameRegistry` (blocklist of real names, unique cores).
- Market day step (AP 1.4) in `market/domain`: `createMarketContext(seedKey, world, config = DEFAULT_MARKET_CONFIG)` (factor/instrument layout in typed arrays, stream families), `createMarketState`, `stepMarketDay`/`advanceMarket` (support points of a trading day in a reused `MarketDay`; weekends skipped), `FactorHistory` with month-start states and `recomputeFactorDays`/`recomputeInstrumentHistory`, `runPrehistory` (epoch → game start), `snapshotMarket`/`restoreMarket`, `marketChecksum`, `priceFromLog` (price floor). Day streams use `StreamFamily` from `simulation/util` (bit-identical to `createStream`, much faster).
- Minute prices and candles (AP 1.5) in `market/domain`: month-start entries of the history also hold `U_i`, so `recomputeSupportDays` rebuilds any past day bit for bit; `DayCurves` builds the minute bridges of one day (`bridge-logic.ts`, streams `…/<day>/bridge[/<interval>]` via `StreamFamily.create(n, suffix)`); `PriceSource` is the engine's price source (`priceAt`, `minuteCurve`, `candles` for `1m`–`1w`, `rememberDay`, LRU cache). Every query takes `now` and never returns values after it. `createHighLowFill` is the time-sliced background job for high/low; `candle-logic.ts` holds the candle convention. `market/domain/testing/reference-simulation.ts` is a test-only minute-by-minute reference.
- Dividends and indices (AP 1.6a) in `market/domain`: companies carry `dividend.schedule` (stream `world/dividends`); `dividend-logic.ts` (ex-dates, announcement 20 market days ahead, payment date, amount, markdown); `MarketState` and the month-start entries hold the full state (`logClose`, `nextExDay`, `dividendCents`, `indexReinvest`); `stepInstrument` writes into the state; `MarketDay` reports announcements, ex-dates and `R` per boundary. `IndexLayout` (constituents, capping fixed at the epoch, constant divisor, index session) in `MarketContext.indices`; `stepIndices` advances `R` from the previous closes. Series (`series.ts`): shares, then price indices, then total return indices share one index for `PriceSource`, `DayCurves.seriesCurve`, `dailyCandlesFromSupport` and `createHighLowFill`.
- ETFs, indicative values and quotes (AP 1.6b) in `market/domain`: ETFs carry `startPrice` and, when distributing, a `schedule` (stream `world/etf-terms`); `EtfLayout` in `MarketContext.etfs`; `stepEtfs` advances `k` (TER, tracking noise from `market/etfs/<day>`) and the distribution pot per boundary after `stepIndices`; ETFs are series after the total return indices (`etfSeries`), their NAV comes from the indicative values of the constituents. `DayCurves.indicativeCurve`/`PriceSource.indicativeAt` give indicative values (frozen `U_i`, factor bridges); `SupportValues` gives opens and closes of all series from the support points. `quote-logic.ts` (`marketSpread`, `quote`) and `PriceSource.quoteAt(series, tick, now, venueMarkup)` give bid and ask on the price grid.
- Simulation lab (AP 1.7) at `#/lab/simulation` (only with `devPages`, currently on in production too): `lab/domain` (`LabSimulation`: world, prehistory, day steps, candles from minute curves or, for long periods, from the support points), `lab/data-access` (`lab-simulation.worker.ts` around the framework-free `LabWorkerSession`, `LabSimulationService` with `LAB_WORKER_FACTORY`; precursor of AP 2.2) and the `lab` slice. `charts/ui/price-chart` wraps `lightweight-charts` (E-04, loaded with a dynamic import, colours from the tokens, game time on the time axis via `tickToChartTime`); AP 4.2 extends it. Web workers use `tsconfig.worker.json` (`*.worker.ts`).
- Lab frame: `lab/feature/lab/lab.page` is the parent route of `#/lab` (`''` → `simulation`) with a header (brand, `lab/ui/section-lab-nav` with Simulation, UI-Bausteine, Design-Tokens, and a „Zur App“ link to `/players`); lab pages render inside its `<main>` and don't set their own page background. The player selection links to the lab. New lab pages are child routes with a `title` and a nav entry in `LabPage.navItems`.
- Lab statistics (AP 1.8a): `analysis/domain` holds framework-free statistics (`statistics-logic.ts`: volatility, correlation, kurtosis, autocorrelation, quantiles, histogram; `drawdown-logic.ts`); reuse them for later risk figures instead of writing new helpers. `lab/domain`: `collectMarketSample` (daily closes and returns from the support points), `computeLabStatistics` against `CALIBRATION_TARGETS` (measurement rules in TS §6.9), `LabSimulation.statistics(start)`/`simulateYears`; the page shows them in `section-statistics` with presentational parts in `lab/ui`.
- Page and component tests (§10): helpers in `src/testing/` (`renderRoute`/`settle`, DOM helpers, `installChartPlatform`, `installViewport`), platform polyfills in `src/test-setup.ts`, `provideInProcessLabWorker()`. Page tests: `shell/feature/shell`, `lab/feature/simulation` (including the statistics); component tests: `charts/ui/price-chart`, `shared/ui/tabs`, `shared/ui/dialog-confirm`.
- `ng build`, `ng lint` and `ng test` are green. CI runs all three before deploying.
- Environment values (`src/environments/`): `production`, `storeDevtools` (`null` = off) and `devPages` (flag for the lab and developer pages; for now `true` in production as well, so all visitors reach the lab). Only bootstrap code imports them.
- An earlier Ionic prototype was deleted; don't build on it. View prototype code with `git show 9bab719^:<path>`.

**Planned architecture (TS §2, §11):**

- A pure, deterministic `GameEngine` runs in a Web Worker and is authoritative for all game rules.
- The UI sends commands through an `EngineService`, and NgRx holds only throttled projections (TS §11.3).
- Market prices are a pure function of seed, simulation version and game time (`priceAt`, bridge model, E-20).
- Simulation code follows the determinism rules in TS §4.5.
- Domain folders and slices follow TS §11.1 and §11.3.
- The additions and exceptions from TS §11.2 are part of this file since AP 0.2 (marked as exceptions where they deviate).

**Repo facts the rules below don't state:**

- Component/directive prefix `app`; eslint enforces the class suffixes `Page`/`Component`.
- Prettier `printWidth` is 100.
- Styling uses Tailwind CSS v4 with the semantic `--pgo-*` tokens in `src/styles.css` (§4). No UI framework besides the Angular CDK. Every new runtime dependency needs an entry in TS §16.
- **Exact dependency versions:** every version in `package.json` is pinned exactly (`"4.3.5"`), never a range with `^`, `~`, `>=` or `*`. The project `.npmrc` sets `save-exact=true`, so `npm i <pkg>` saves exact versions; check `package.json` after installing anyway. Updates are deliberate version bumps.
- `npm run build` writes to `www/`. Every push to `main` builds and deploys via SFTP (`.github/workflows/publish.yml`).

**Commands** (in addition to §11):

| Task              | Command                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Select Node first | `nvm use` (`.nvmrc` = 22.22.3; the shell default 22.12 is too old for Angular CLI 22)         |
| Dev server        | `npm start` (port 4711); `ng serve --ssl --host 0.0.0.0` for phones (HTTPS-only browser APIs) |
| Single spec file  | `ng test --watch=false --include src/app/<path>/<name>.spec.ts`                               |
| Tests by name     | `ng test --watch=false --filter '<regex>'`                                                    |
| Extract i18n      | `npm run translate` → root `messages.xlf`                                                     |

Tests run with Vitest under jsdom (`@angular/build:unit-test`, setup in `src/test-setup.ts`).

**Checking changes in the browser:** after implementing UI changes, check them in the real app with the Playwright MCP server (`.mcp.json`: headless Google Chrome, fresh profile per session) against the dev server on port 4711. If the server isn't running, start it with the command from `.claude/launch.json` (selects Node via nvm, no `--open`). Navigate to the affected page, go through the flows by `data-testid`, read the console and take screenshots for layout questions. Playwright writes its output to `.playwright-mcp/` (git-ignored); close the browser when done. This complements the page tests and doesn't replace them. A new machine needs Google Chrome and nvm in `~/.nvm`.

## 0. How to use this file

- **When editing existing files, keep them internally consistent.** Don't mix styles within one file, and don't refactor unrelated code unless you are asked to.
- When this file and the surrounding code disagree, ask instead of guessing.
- Reuse existing services, tokens, validators and helpers before building new ones.

## 1. Architecture: domains and layers

Code is grouped by domain first, then by layer: `src/app/<domain>/<layer>/…`, e.g. `users/feature`, `users/data-access`, `users/domain`. The app root (`main.ts`, root component, root routes) only bootstraps and wires things up. All functionality lives in the domain folders.

| Layer         | Contains                                                                     | May depend on                          |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `feature`     | routes, pages, smart components, NgRx state (actions/reducer/effects/facade) | feature, ui, data-access, domain, util |
| `ui`          | presentational components (inputs/outputs only), pipes, form components      | ui, domain, util                       |
| `data-access` | HTTP/WebSocket/storage services, config tokens, mock interceptors            | data-access, domain, util              |
| `domain`      | models (interfaces, `as const` lists) and pure domain logic                  | domain, util                           |
| `util`        | generic helpers without domain knowledge                                     | util                                   |

Nothing enforces these rules automatically, so check your imports. If a dependency doesn't fit, move the code to the right layer instead of importing across.

- **Framework-free layers:** `domain` and `util` import nothing from `@angular/*`, `@ngrx/*` or `rxjs`. That way the code runs in the Web Worker and in tests without TestBed.
- **Worker:** the engine worker imports only `domain`, `util` and framework-free persistence modules, and never creates an Angular injector. Simulation code follows the determinism rules in TS §4.5.
- **Texts and access:** user-facing texts exist only in Angular (i18n, §5); the engine returns codes, which the `feature` or `ui` layer maps to `$localize` texts. Components never access IndexedDB, localStorage or the worker directly, only through facades.

## 2. Folder structure per layer

**feature:**

```
<domain>/feature/
├── <domain>.routes.ts              # export const <domain>Routes: Routes
├── <name>/                         # routed page: <name>.page.{ts,html,scss}
├── section-*/ dialog-*/            # smart sub-components and dialogs
└── state/
    ├── <domain>.actions.ts
    ├── <domain>.reducer.ts
    ├── <domain>.selectors.ts
    ├── <domain>.effects.ts
    ├── <domain>.facade.ts
    ├── <domain>.guards.ts          # enter/leave guard factories
    ├── <domain>.providers.ts       # provide<Domain>State()
    ├── <domain>.model.ts           # state-related types (e.g. submitted payloads)
    └── <domain>.utils.ts           # pure helpers for effects/reducer
```

**ui:** one folder per component (`section-*`, `form-*`, `dialog-*`). Component-specific types go in a sibling `<component>.model.ts`. Pipes live under `pipes/<name>/<name>.pipe.ts`.

**data-access:**

```
<domain>/data-access/service/
├── <name>.service.ts               # <Name>Service
├── <name>-service.providers.ts     # provide<Name>Service()
├── <name>-service.config.ts        # <Name>ServiceConfig + <NAME>_SERVICE_CONFIG token
├── <name>-service.mock.ts          # <name>ServiceMock: HttpInterceptorFn
├── <name>-service.model.ts         # transport-only types (events, payloads)
├── <name>-service.utils.ts         # type guards etc.
└── mock-*.data.json                # mock fixtures
```

**domain:** models in `models/<name>.model.ts`. Pure domain functions go in `*-logic.ts` or `*.utils.ts` if needed.

## 3. Components and templates

### Naming and metadata

- Routed pages are named `<name>.page.{ts,html,scss}` with the class `<Name>Page`. All other components are named `<name>.component.{ts,html,scss}` with the class `<Name>Component`.
- The selector is `<prefix>-<name>`, using the project prefix from `angular.json`.
- Name prefixes for non-page components by role: `section-` for parts of a page, `dialog-` for dialog content, `form-` for form components.
- Standalone is implicit, so don't write `standalone: true`. NgModules are not used.
- Metadata order is `selector`, `imports`, `templateUrl`, `styleUrl` (singular). Use separate template and style files, even if the scss is empty.
- Don't set `changeDetection`. The framework default applies (OnPush since Angular 22).
- Write code that works zoneless: everything the template shows must come from signals, the `async` pipe or template events. Never assign plain fields from subscriptions, promises or timers and expect the view to update. Don't use `NgZone`.
- `imports`:
  - `CommonModule` when the template needs common pipes such as `async`.
  - `RouterModule` for router directives.
  - Import UI library components the way the library exports them (standalone components or NgModules), and only those the template uses.

### Class members

```ts
// feature component; ui components have no injections, only inputs/outputs
export class SectionOrderItemsComponent {
  facade = inject(OrdersFacade); // read by the template → public, no modifier
  readonly #router = inject(Router); // only used in the class → private field

  items = input.required<OrderItem[]>();
  activeItem = input<string>();
  countries = input<Country[] | null>(); // fed from `| async` → allow null

  selectedItem = output<string>(); // outputs are past-tense events
  clickedBack = output<void>();

  itemCount = computed(() => this.items().length);
  order = toSignal(this.facade.order$); // only if the class (not the template) needs the value

  title = $localize`:@@featureOrders-sectionOrderItems-title:Positionen`;

  onSelectItem(itemId: string): void {
    this.selectedItem.emit(itemId);
  }

  #formatLabel(item: OrderItem): string {
    return `${item.position} – ${item.name}`;
  }
}
```

- DI uses only `inject()` field initializers, never constructor injection.
- Visibility:
  - Template-facing members have no modifier. Don't use `protected`.
  - Class-only members are ECMAScript private fields: `readonly #router = inject(Router)`, `#formatLabel(…)`. Don't use the `private` keyword or a `_` prefix.
- Signal APIs only: `input()`, `input.required()`, `output()`, `model()` (only for custom form controls), `computed()`, `linkedSignal()`, `viewChild()`. Don't put `readonly` on them.
- Outputs are named as past-tense events: `clickedBack`, `selectedItem`, `submittedOrderDetails`, `markedFile`.
- Template handlers are named `onX(...)` (`onSelectItem`). For form or dialog actions use plain verbs (`submit()`, `confirm()`, `decline()`).
- Member order:
  1. `inject()`
  2. inputs
  3. constants
  4. outputs
  5. view queries
  6. derived state (`computed`, `toSignal`)
  7. `$localize` labels
  8. lifecycle hooks
  9. handlers
  10. private helpers
- Methods have explicit return types. Lifecycle hooks come with `implements OnInit` etc.
- **No manual `.subscribe()` in components.** Read state through `@let … | async` in the template or `toSignal()`. If a subscription is unavoidable, use `takeUntilDestroyed()`.

### Templates

```angular
@let order = ordersFacade.order$ | async;
@let markedItemIds = ordersFacade.markedItemIds$ | async;
@let isMaxOneMarked = (markedItemIds ?? []).length < 2;

@if (order && isMaxOneMarked) {
  @for (item of order.items; track item.id) {
    <app-section-item [item]="item" (selectedItem)="onSelectItem($event)"></app-section-item>
  }
}
```

- Collect all stream reads in a `@let x = facade.x$ | async;` block at the top of the template.
- Use only built-in control flow (`@if`, `@for`, `@switch`, `@defer`), never `*ngIf`/`*ngFor`.
- `@for` always tracks by an identity field (`track item.id`), or by `$index` for primitives.
- To unwrap a signal under the same name, use an underscore alias: `@let _form = form();`.
- **`data-testid` on interactive elements** (buttons, inputs, list entries, dialog actions). Use the dot-separated scheme `<feature>.<area>.<element>`, e.g. `data-testid="orders.create-order.submit"`. For dynamic values write `[attr.data-testid]="'orders.item-list.' + id + '.toggle-collapse'"`.

### Forms

New forms use **Signal Forms** (`@angular/forms/signals`). Don't use Reactive Forms (`FormGroup`, `FormControl`), template-driven forms or `ngModel`. Existing Reactive Forms stay as they are until a migration is requested (see §0), and a component never mixes both APIs.

```ts
export class FormGeneralInformationComponent {
  info = input.required<GeneralInformation>();

  submittedGeneralInformation = output<GeneralInformationModel>();

  generalInformationModel = linkedSignal<GeneralInformationModel>(() => ({
    name: this.info().name,
  }));
  generalInformationForm = form(
    this.generalInformationModel,
    (path) => {
      required(path.name, {
        message: $localize`:@@uiOrders-formGeneralInformation-nameRequired:Bitte gib einen Namen ein.`,
      });
    },
    {
      submission: {
        action: async (field) => this.submittedGeneralInformation.emit(field().value()),
      },
    },
  );
}
```

```angular
@let _name = generalInformationForm.name();

<form [formRoot]="generalInformationForm">
  <input [formField]="generalInformationForm.name" data-testid="orders.general-information.name" />
  @if (_name.touched() && _name.invalid()) {
    @for (error of _name.errors(); track error.kind) {
      <span>{{ error.message }}</span>
    }
  }
  <button
    type="submit"
    data-testid="orders.general-information.submit"
    i18n="@@uiOrders-formGeneralInformation-submit">
    Speichern
  </button>
</form>
```

- **Model:** a writable signal that holds exactly the values the controls edit (e.g. strings for masked inputs). Its type goes in the component's `*.model.ts`. Name the pair `<name>Model` and `<name>Form`.
  - Empty forms start from `signal({...})`.
  - Forms filled from an input use `linkedSignal(() => …)`. It resets when the input changes, and user edits stay local. Don't build forms inside `computed()`.
  - If the input can receive new references for the same entity while the user is editing (polling, selectors that project new objects), reset only on identity change. The key must be its own `computed`, because a `source: () => this.info().id` would still make the linked signal depend on `info` itself:

    ```ts
    #infoId = computed(() => this.info().id);
    generalInformationModel = linkedSignal({
      source: this.#infoId,
      computation: () => ({ name: untracked(this.info).name }),
    });
    ```

- **Schema:** validation and field state (`disabled`, `hidden`, `readonly`) are declared in the schema function, reactive via `when`, and never toggled imperatively from effects. Write `$localize` messages inline in the schema (`message:`); the schema runs when `form()` is created, before class-field labels exist.
  - Custom rules: `validate(path.x, ({ value }) => (… ? { kind: 'x', message: … } : null))`. Async rules use `validateAsync`/`validateHttp`.
  - Reusable rule sets are `schema<T>(…)` constants or functions that take a `SchemaPath`. **Exception:** they live in the `ui` layer (like pipes); the pure check and formatting functions they call live in `domain` or `util`.
- **Binding:** import `FormField` and `FormRoot` from `@angular/forms/signals` and bind every control with `[formField]`. This works for native inputs, for custom controls that implement `FormValueControl`/`FormCheckboxControl`, and for third-party components through their `ControlValueAccessor`. New custom controls implement `FormValueControl` (`value = model<T>()`), not `ControlValueAccessor`.
- **Submission:** define `submission.action` in the `form()` options and bind `<form [formRoot]="xForm">`. Submitting marks all fields as touched and runs the action only when the form is valid. A form component maps the model if needed and emits a typed result through an output (`submittedGeneralInformation`); saving happens in the feature layer.
- **Template state:** read field state through its signals (`xForm.name().invalid()`, `.touched()`, `.errors()`) and show errors only for touched fields.
- Don't use `@angular/forms/signals/compat` unless a migration is explicitly requested.

### Dialogs

- Dialog content components live in `dialog-<name>/`.
- Open dialogs typed, with data and result types in the dialog's `*.model.ts`.
- Open dialogs from **effects**, not from ui components. Map the closed result to an action, e.g. `filter(Boolean), map(() => action)`. Confirmations use a shared confirm dialog instead of ad-hoc ones.

### ui layer

ui components are purely presentational, with data in through inputs and events out through outputs. No facades, `Store`, services, `Router` or dialogs.

**Exception (own UI library, TS §11.2 point 8):** `shared/ui` plays the role of a component library. It contains the `ToastService` (provided once at bootstrap via `provideToastService()`) and `openConfirmDialog(dialog, data)`, and the confirm dialog injects `DialogRef`/`DIALOG_DATA`. Effects use these for toasts and confirmations; components in other `ui` folders still don't.

## 4. Styling

Styling uses **Tailwind CSS v4** with semantic tokens (TS §11.5). `src/styles.css` is the only global stylesheet: it imports Tailwind, defines the `--pgo-*` tokens for light (`:root`, `.light`) and dark (`.dark`) and maps them to Tailwind colours via `@theme inline`. The default palette is disabled.

- **Templates use utility classes**, colours only from the tokens: `bg-bg`, `bg-surface`, `bg-surface-raised`, `border-border`, `text-fg`, `text-fg-muted`, `text-accent`, `text-up`, `text-down`, `text-warning`. Spacing, sizes and typography come from Tailwind's scale.
- **No arbitrary values** (`p-[13px]`, `bg-[#123456]`) and no default colours (`bg-red-500` produces no styles anyway). New colours are new tokens in `src/styles.css`, with text contrast ≥ 4.5:1 in both themes (check on `#/lab/tokens`).
- Write class names in full. Tailwind finds classes by scanning the sources, so don't assemble them from strings (`'bg-' + x`). Component variants use signal inputs and a `computed` class mapping with complete class names.
- Numbers (amounts, prices, percentages) get `tabular-nums`.
- Dark mode is the class `dark` on `<html>`. Because the tokens switch, components rarely need the `dark:` variant.
- **Component SCSS** (one `.component.scss` / `.page.scss` per component) is only for `:host` and special cases. There, tokens are read as `var(--pgo-*)`; never hard-coded hex/rgb values or `rem` spacing. No Tailwind directives (`@apply`, `@reference`, `@theme`) in component styles.
- Use `:host` for host styling. Don't override `ViewEncapsulation`.
- Icons come from `bootstrap-icons`. Don't mix in other UI frameworks (Angular Material, Bootstrap utility classes, …).
- Custom class names in SCSS follow BEM (`block__element--modifier`).
- Use `::ng-deep` only to reach into library internals, and scope it under `:host`.

## 5. i18n

The source locale is **German** (`de`).

- Every user-facing text gets an **explicit custom ID**, without meaning or description.
- ID scheme: `@@<layer><Domain>-<componentOrClass>-<key>`.
  - `<layer><Domain>` is the layer and domain the text lives in, in camelCase (`users/feature` → `featureUsers`, `orders/ui` → `uiOrders`).
  - `<componentOrClass>` is the class name in camelCase without the `Component` suffix (`createUserPage`, `sectionOrderItems`, `ordersEffects`).
  - `<key>` may have several segments (`createUserForm-name-label`).
  - Examples: `@@featureUsers-createUserPage-submit`, `@@uiOrders-formGeneralInformation-name`, `@@featureOrders-ordersEffects-loadOrdersFailure`.
  - Never reuse an ID for a different text.
- In TypeScript, create class-field labels: ``label = $localize`:@@featureX-xPage-label:Text`;``
- In templates: `<span i18n="@@uiX-sectionX-title">Titel</span>`, `<ng-container i18n="@@…">`, and `i18n-<attr>="@@…"` for attributes (e.g. `i18n-label`).
- After adding or changing texts, run `ng extract-i18n` and keep the updated source `messages.xlf` in the change.

## 6. State management (NgRx)

State lives in the classic global NgRx Store. Don't introduce `createActionGroup`, `createFeature`, functional effects, ComponentStore, SignalStore or signal-based state services.

**Actions** (`<name>.actions.ts`) are named as events, with a `[<Feature>/Page]` or `[<Feature>/API]` source:

```ts
export const enterOrdersPage = createAction('[Orders/Page] Enter orders page');
export const clickedStartExport = createAction('[Orders/Page] Clicked start export');
export const retrievedOrder = createAction(
  '[Orders/API] Retrieved order',
  props<{ order: Order }>(),
);
export const deleteOrderSuccess = createAction(
  '[Orders/API] Delete order success',
  props<{ orderId: string }>(),
);
export const deleteOrderFailure = createAction(
  '[Orders/API] Delete order failure',
  props<{ error: unknown }>(),
);
```

- Prefixes: `enterX`/`leaveX` for route lifecycle, `clickedX`/`submittedX` for user events, `retrievedX`/`receivedX`/`loadedX` for data arrivals, `xSuccess`/`xFailure` for API results.
- Errors are always `props<{ error: unknown }>()`.

**Reducer** (`<name>.reducer.ts`):

```ts
export const ORDERS_FEATURE_KEY = 'orders';

export interface OrdersState {
  loaded: boolean;
  details?: Order;
  error?: unknown;
}

const initialOrdersState: OrdersState = { loaded: false };

const reducer = createReducer(
  initialOrdersState,
  on(OrdersActions.enterOrdersPage, () => initialOrdersState),
  on(OrdersActions.retrievedOrder, (state, { order }) => ({ ...state, details: order })),
);

export function ordersReducer(state: OrdersState | undefined, action: Action): OrdersState {
  return reducer(state, action);
}
```

- Feature keys are camelCase strings. Use `@ngrx/entity` adapters for larger keyed collections.

**Selectors** (`<name>.selectors.ts`):

- `const selectState = createFeatureSelector<XState>(X_FEATURE_KEY);`, then `export const selectX = createSelector(selectState, (state) => state.x);`
- Read route params here via the router-store selectors (`getRouterSelectors()` from `@ngrx/router-store`, e.g. `selectRouteParam('orderId')`), not via `ActivatedRoute` in components.

**Effects** (`<name>.effects.ts`):

- Write an `@Injectable()` class with `readonly #x = inject(...)` fields and `createEffect(() => this.#actions$.pipe(ofType(...), ...))`.
- Read store state with `concatLatestFrom(() => this.#store.pipe(select(...)))` from `@ngrx/operators` (add the package when it's first needed), not `withLatestFrom`.
- Put `catchError((error) => of(xFailure({ error })))` inside the inner `switchMap` pipe, so the effect stream survives.
- Side effects use `{ dispatch: false }` effects that react to actions:
  - toasts and loading indicators via the UI library's services, with `$localize` texts;
  - page title via `Title.setTitle(...)` on `enterXPage`;
  - navigation via `Router`;
  - dialogs.
- Close long-lived streams (WebSocket, polling, timers) with `takeUntil(this.#actions$.pipe(ofType(leaveX)))`.

**Facade** (`<name>.facade.ts`), the only entry point for components:

```ts
@Injectable()
export class OrdersFacade {
  readonly #store = inject(Store);

  order$ = this.#store.pipe(select(OrdersSelectors.selectOrder));

  startExport(): void {
    this.#store.dispatch(OrdersActions.clickedStartExport());
  }
}
```

- Components never inject `Store` directly.

**Providers** (`<name>.providers.ts`):

```ts
export function provideOrdersState(): Array<Provider | EnvironmentProviders> {
  return [
    OrdersFacade,
    provideState(fromOrders.ORDERS_FEATURE_KEY, fromOrders.ordersReducer),
    provideEffects(OrdersEffects),
    provideOrdersService(),
  ];
}
```

- Register route-scoped state in the route: `providers: [provideOrdersState()]`. App-wide state is registered in the application's bootstrap providers.
- **Exception (engine and game slices, TS §11.2):** `provideEngineService()` is registered exactly once, in `provideAppCore()`, so there is exactly one worker and page tests get the same wiring (they only replace the worker, §10). Slice providers don't include the `EngineService`. The slices of the game area are registered exactly once at the shell route `/game/:playerId` (`provideGameState()`), so effects are not instantiated twice.

**Loading data** is triggered by route guards (`<name>.guards.ts`), not by `ngOnInit`:

```ts
export function enterOrdersPage(): CanActivateFn {
  return () => {
    inject(OrdersFacade).enterOrdersPage();
    return true;
  };
}
// routes: canActivate: [enterOrdersPage()], canDeactivate: [leaveOrdersPage()]
```

- Subscriptions and queries for a page are started by its enter guard and ended by its leave guard. When the required data changes on the page (filters, next page, chart range), effects react to the user's action. The store holds only what the current view needs (one statement page, the candles of the visible chart), never complete journals or histories.
- App-wide state that has to be ready before any route may instead be initialised in its `provideXState()` via `provideAppInitializer(() => inject(XFacade).init())`.

## 7. Data access

**Service:**

```ts
@Injectable()
export class OrdersService {
  readonly #http = inject(HttpClient);
  readonly #config = inject(ORDERS_SERVICE_CONFIG);

  getOrder(orderId: string): Observable<Order> {
    return this.#http.get<Order>(`${this.#config.serviceUrl}/orders/${orderId}`);
  }
}
```

- Services are `@Injectable()` without `providedIn` and are provided through `provide<Name>Service()` in `<name>-service.providers.ts`. The `provideXState()` that uses the service includes it, except for the `EngineService` (§6).
- Methods return typed Observables of domain interfaces. Only map DTOs when the API shape really differs.
- Use `HttpClient`, not `httpResource`/`resource`. Handle errors in effects; local fallbacks like `404 → of([])` are fine in the service.

**Config token** (`<name>-service.config.ts`):

```ts
export interface OrdersServiceConfig {
  serviceUrl: string;
  useMock?: boolean;
}

export const ORDERS_SERVICE_CONFIG = new InjectionToken<OrdersServiceConfig>(
  'ORDERS_SERVICE_CONFIG',
);
```

- Config tokens are provided at bootstrap, from `environment`. **Only bootstrap code imports environment files**; everything else gets its configuration through injection tokens.
- New environment values go in the environment interface/model and in every `environment*.ts`.

**Mock** (`<name>-service.mock.ts`):

- A functional `HttpInterceptorFn` named `<name>ServiceMock`.
- It passes through unless `config.useMock` is set and the URL starts with `config.serviceUrl`.
- It returns `mock-*.data.json` fixtures with an artificial random delay.
- Register it in `withInterceptors([...])` at bootstrap.

**Other rules:**

- Interceptors are functional (`HttpInterceptorFn`), registered with `provideHttpClient(withInterceptors([...]))`.
- Message type guards for WebSocket or other untyped transports go in `<name>-service.utils.ts`.

## 8. Routing and bootstrap

- Each feature has `<domain>.routes.ts` exporting `export const <domain>Routes: Routes`.
- Features are lazy-loaded; pages inside a feature use `loadComponent`:

  ```ts
  {
    path: 'orders',
    loadChildren: async () => {
      return (await import('./orders/feature/orders.routes')).ordersRoutes;
    },
  },
  ```

- Guards are functional only: `CanActivateFn`/`CanDeactivateFn` factories, called in the route definition. No class guards and no resolvers. Redirect with `RedirectCommand`.
- App-level wiring (router, store, router store, devtools, config tokens, interceptors, app-wide state) happens in the bootstrap providers. Use `provideAppInitializer(...)`, never `APP_INITIALIZER`.

## 9. Domain models and TypeScript

- Use `interface` for object shapes and `type` for unions, aliases and `Pick`/`Omit` derivations.
- Enum-like values use an `as const` list with a derived type, **not** a TS `enum`:

  ```ts
  export const ORDER_TYPES = ['standard', 'express'] as const;
  export type OrderType = (typeof ORDER_TYPES)[number];
  ```

- Model files are named `*.model.ts`.
- Code compiles under `strict` and `strictTemplates`. Use `unknown` instead of `any`, and don't use non-null assertions to silence real nullability.
- Unused parameters and variables get a `_` prefix. Unused imports are a lint error.
- Imports are sorted by eslint (`import/order`, alphabetical, groups separated by blank lines). Run `ng lint --fix` instead of sorting by hand.
- Formatting is done by Prettier (`.prettierrc`), not by hand. `bracketSameLine` and strict HTML whitespace are intentional, so closing tags like `"></ion-input>` or `>Text</ion-title\n>` are expected.
- Identifiers and comments are in English; only i18n source texts are German.
- Comments are sparse: no JSDoc on obvious members and no section banners. Comment only non-obvious decisions.

## 10. Testing

- **Logic is always tested:** reducers, selectors, effects, facades, services, guards, interceptors, validators and pure functions (`*.utils.ts`, `*-logic.ts`).
- **Pages get page tests** and **ui components with their own behaviour** (charts, forms with validation, …) get component tests, both as integration tests (see below). Purely presentational components, directives and pipes are covered by the page tests and not tested on their own.
- Specs sit next to the file: `<name>.<kind>.spec.ts`. They run with Vitest through `ng test` (globals such as `describe`, `it`, `vi` are available).

```ts
describe('OrdersEffects', () => {
  let effects: OrdersEffects;
  let actions$: Subject<Action>;
  let service: Mocked<Pick<OrdersService, 'getOrder'>>;
  const err = new Error('load failed');

  beforeEach(() => {
    actions$ = new Subject();
    service = { getOrder: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        OrdersEffects,
        provideMockActions(() => actions$.asObservable()),
        { provide: OrdersService, useValue: service },
      ],
    });
    effects = TestBed.inject(OrdersEffects);
  });

  describe('loadOrder$', () => {
    it('dispatches loadOrderFailure when the service errors', async () => {
      service.getOrder.mockReturnValue(throwError(() => err));
      const result = firstValueFrom(effects.loadOrder$);
      actions$.next(OrdersActions.enterOrdersPage());
      expect(await result).toEqual(OrdersActions.loadOrderFailure({ error: err }));
    });
  });
});
```

- Structure: `describe('<ClassOrFunction>')`, nested `describe` per method or effect, and `it('<verb>s … when …')` in English without "should".
- What to test, and how:
  - **Reducers:** call directly with an action.
  - **Selectors:** test via `selectX.projector(state)`.
  - **Facades:** use `provideMockStore` + `vi.spyOn(store, 'dispatch')`.
  - **HTTP services:** use `provideHttpClient()` + `provideHttpClientTesting()` with `HttpTestingController`, and `httpMock.verify()` in `afterEach`.
  - **Functional guards:** use `TestBed.runInInjectionContext(() => guard()(route, state))` + `firstValueFrom`.
  - **Reusable form schemas and rules:** create the form with `TestBed.runInInjectionContext(() => form(signal(model), schema))` and assert on `xForm.field().errors()`.
- Mocks (logic tests only; page and component tests don't mock, see below):
  - Plain objects with `vi.fn()`, typed `Mocked<Pick<…>>` (`import type { Mocked } from 'vitest'`).
  - Packages that don't load in the test environment (e.g. heavy ESM UI libraries) are replaced via `vi.mock(...)`.
- Await Observables with `firstValueFrom`/`lastValueFrom` instead of `done` callbacks. Don't use marble testing or `fakeAsync`.

### Page and component tests

They run the real code: store, effects, facades, services, worker code, child components and `lightweight-charts`. Only process and platform boundaries are replaced, so don't mock anything else in them (no `MockStore`, fake services or stub components).

- **Plan them with the component.** Whoever plans a new page or ui component (an AP plan included) names its page or component test right away: the user flows it checks, the displayed values that need a `data-testid`, and the seams the code needs to be testable (worker factory tokens with a root default, `PendingTasks` for asynchronous work outside Angular, deterministic seeds and clocks).
- **Page tests** (`<name>.page.spec.ts`) open the page through the app's real routes with `renderRoute(url, providers)` from `src/testing/page.ts`. It uses `provideAppCore()` (the app-wide providers of `app.config.ts`) and `RouterTestingHarness`, so guards and route providers run as in the app.
- **Component tests** (`<name>.component.spec.ts`) create the component with `TestBed.createComponent`, set inputs with `fixture.componentRef.setInput(...)` and subscribe to the outputs. Components that take content (e.g. `app-tabs` with `appTabPanel` templates) get a small host component in the spec; overlays (dialogs, toasts) are found in `document.body`.
- Replaced boundaries:

  | Boundary                         | Replacement                                                                                                                                                                                                                      |
  | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Web Worker                       | the same session code in the test process, provided at the root injector, e.g. `provideInProcessLabWorker()` (`lab/data-access/testing/`). Worker factory tokens therefore have a root default instead of being route providers. |
  | IndexedDB                        | `fake-indexeddb`                                                                                                                                                                                                                 |
  | Canvas, layout, `ResizeObserver` | polyfills in `src/test-setup.ts` (2D context without drawing, silent observer); `installChartPlatform()` (`src/testing/chart-platform.ts`) for container size and colour tokens                                                  |
  | Viewport (media queries)         | `installViewport(width)` (`src/testing/viewport.ts`), called before `renderRoute`; without it no media query matches (phone layout)                                                                                              |
  | Clocks, randomness               | deterministic clocks; tests type seeds instead of generating them                                                                                                                                                                |

- Act like a user through `data-testid` with the helpers in `src/testing/dom.ts` (`byTestId`, `queryByTestId`, `textOf`, `click`, `typeText`, `select`, `press`, `wheel`) and assert on what the page shows. Displayed values that a test reads get a `data-testid` too.
- Wait with `settle(fixture)` (`src/testing/page.ts`): `whenStable()`, a few animation frames (charts report their range in a frame), `whenStable()` again. Asynchronous work outside Angular (worker answers, lazy libraries) is registered as `PendingTasks`, so `whenStable()` covers it; don't poll.
- Compute expected values with the domain code, e.g. a `LabSimulation` with the same seed as oracle, instead of hard-coding numbers of the generated world.
- Page tests cover user flows and the wiring; edge cases stay in the logic tests. Pixels, layout and real gestures are not covered (TS §14.1).

## 11. Verify your changes

| Task           | Command                        |
| -------------- | ------------------------------ |
| Type-check     | `ng build`                     |
| Lint (and fix) | `ng lint --fix`                |
| Unit tests     | `ng test --watch=false`        |
| Format         | `npx prettier --write <files>` |
| Extract i18n   | `ng extract-i18n`              |

## 12. Patterns to avoid

| Don't                                                                                 | Use instead                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@Input()` / `@Output()` / `EventEmitter`, `@ViewChild`                               | `input()`, `output()`, `viewChild()`                                     |
| Constructor injection                                                                 | `inject()` field initializers                                            |
| `private` keyword, `_` prefix for private members                                     | `#` private fields                                                       |
| `standalone: true`, NgModules, explicit `changeDetection`                             | framework defaults                                                       |
| `unsubscribe$ = new Subject()` + `takeUntil` + `ngOnDestroy`; subscribing into fields | `@let … \| async`, `toSignal()`, `takeUntilDestroyed()`                  |
| `*ngIf`, `*ngFor`                                                                     | `@if`, `@for` with `track`                                               |
| Reactive Forms (`FormGroup`, `FormControl`), `ngModel`, forms built in `computed()`   | Signal Forms: `form()` on a `signal`/`linkedSignal` model, `[formField]` |
| `ControlValueAccessor` for new custom form controls                                   | `FormValueControl` / `FormCheckboxControl`                               |
| Class interceptors registered via `HTTP_INTERCEPTORS`                                 | functional `HttpInterceptorFn` + `withInterceptors`                      |
| Class guards, resolvers, `APP_INITIALIZER`                                            | functional guard factories, `provideAppInitializer`                      |
| `provideState`/`provideEffects` inline in route definitions                           | `provideXState()` in `<name>.providers.ts`                               |
| Loading data in `ngOnInit` / `ActivatedRoute` in components                           | enter/leave guard factories + router-store selectors                     |
| `withLatestFrom` in effects                                                           | `concatLatestFrom`                                                       |
| `createActionGroup`, `createFeature`, functional effects, ComponentStore, SignalStore | classic actions, reducer, effects class and facade                       |
| `error: any`, `errorMessage: string` in state                                         | `error: unknown`; user feedback via toast effects                        |
| TS `enum`                                                                             | `as const` list + derived type                                           |
| i18n texts without ID or with IDs that don't follow the scheme                        | `@@<layer><Domain>-<componentOrClass>-<key>`                             |
| Hard-coded hex colours / `rem` spacing                                                | `--pgo-*` tokens: utilities, `var(--pgo-*)` in SCSS                      |
| Arbitrary values (`p-[13px]`), default colours (`bg-red-500`)                         | Tailwind scale and token colours; new tokens in `styles.css`             |
| `@apply`/`@reference` in component SCSS, global Sass                                  | utilities in templates; global styles only in `styles.css`               |
| Class names assembled from strings (`'bg-' + x`)                                      | complete class names in a `computed` mapping                             |
| Dialogs opened from ui components; dialog folders named `<name>-dialog`               | dialogs opened from effects; `dialog-<name>/`                            |
