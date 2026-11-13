import { Browser, CDPSession, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  expectGameReady,
  GAME_START_TEXT,
  getClock,
  getPausedBadge,
  getSessionOverlay,
  resume,
  selectSpeed,
} from './game.po';

// J10 (E-27, TS §14.3): budgets for phones as four times CPU throttling in Chromium. Chromium
// throttles only pages, not dedicated workers („Operation is only supported for pages, not
// workers“), so the page runs throttled and the engine worker's busy time comes from the sampling
// profiler (CDP); the throttled worker time is estimated as four times the measured one. The candle
// job (TS §6.8) is told apart by its entry `CandleBackfill.runSlice` in the call stacks; its share
// of the wall clock is capped, so it does not grow with the throttling.

const PERF_FACTOR = Number(process.env['PERF_FACTOR'] ?? '1');
const CPU_THROTTLING = 4;
const RUNS = 3;

/** E-27: game start below 6 s, engine at 1 w/s below 50 % of a core. */
const GAME_START_BUDGET_MS = 6_000;
const ENGINE_LOAD_BUDGET = 0.5;

const MEASURE_WINDOW_MS = 3_000;
/** Public method names survive the minification of the production build. */
const CANDLE_JOB_ENTRY = 'runSlice';

interface CpuProfile {
  startTime: number;
  endTime: number;
  nodes: { id: number; callFrame: { functionName: string }; children?: number[] }[];
  samples: number[];
  timeDeltas: number[];
}

/** Busy fractions of the wall clock: all samples but `(idle)`, and those inside the candle job. */
interface WorkerLoad {
  busy: number;
  job: number;
}

/**
 * The engine worker through the page's CDP session. Playwright offers no CDP session for workers,
 * so the session attaches to it with `Target.setAutoAttach` and talks through
 * `Target.sendMessageToTarget`.
 */
class EngineWorkerProbe {
  readonly #cdp: CDPSession;
  readonly #replies = new Map<number, (reply: { result?: unknown; error?: unknown }) => void>();
  #nextId = 0;
  #sessionId: string | undefined;
  readonly #attached: Promise<void>;

  private constructor(cdp: CDPSession, profileFromStart: boolean) {
    this.#cdp = cdp;
    let attached: () => void = () => undefined;
    this.#attached = new Promise((resolve) => (attached = resolve));
    cdp.on('Target.attachedToTarget', (event) => {
      if (event.targetInfo.type !== 'worker' || this.#sessionId !== undefined) {
        return;
      }
      this.#sessionId = event.sessionId;
      // The worker waits for the debugger, so a profile can cover it from its first line.
      void (profileFromStart ? this.#startProfiler() : Promise.resolve())
        .then(() => this.#send('Runtime.runIfWaitingForDebugger'))
        .then(attached);
    });
    cdp.on('Target.receivedMessageFromTarget', (event) => {
      const message = JSON.parse(event.message) as { id?: number; result?: unknown };
      if (message.id !== undefined) {
        this.#replies.get(message.id)?.(message);
        this.#replies.delete(message.id);
      }
    });
  }

  /**
   * Throttles the page and attaches to the engine worker once the app creates it; with
   * `profileFromStart`, the worker is profiled from its start until `stopProfile`.
   */
  static async attach(page: Page, profileFromStart = false): Promise<EngineWorkerProbe> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLING });
    const probe = new EngineWorkerProbe(cdp, profileFromStart);
    await cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: false,
    });
    return probe;
  }

  async startProfile(): Promise<void> {
    await this.#attached;
    await this.#startProfiler();
  }

  async #startProfiler(): Promise<void> {
    await this.#send('Profiler.enable');
    await this.#send('Profiler.start');
  }

  /**
   * Stops the profile; returns the busy time (all samples but `(idle)`), the part of it inside the
   * candle job and the wall time.
   */
  async stopProfile(): Promise<{ busyMs: number; jobMs: number; wallMs: number }> {
    await this.#attached;
    const { profile } = (await this.#send('Profiler.stop')) as { profile: CpuProfile };
    const parents = new Map<number, number>();
    profile.nodes.forEach(({ id, children = [] }) => children.forEach((c) => parents.set(c, id)));
    const names = new Map(profile.nodes.map(({ id, callFrame }) => [id, callFrame.functionName]));
    const inJob = (node: number): boolean => {
      for (let at: number | undefined = node; at !== undefined; at = parents.get(at)) {
        if (names.get(at) === CANDLE_JOB_ENTRY) {
          return true;
        }
      }
      return false;
    };
    let busyUs = 0;
    let jobUs = 0;
    profile.samples.forEach((node, index) => {
      if (names.get(node) !== '(idle)') {
        busyUs += profile.timeDeltas[index];
        jobUs += inJob(node) ? profile.timeDeltas[index] : 0;
      }
    });
    return {
      busyMs: busyUs / 1000,
      jobMs: jobUs / 1000,
      wallMs: (profile.endTime - profile.startTime) / 1000,
    };
  }

  /** Busy fractions of the worker over `ms` of wall time. */
  async load(ms: number): Promise<WorkerLoad> {
    await this.startProfile();
    // A measurement window of real time, not a wait for a state.
    await new Promise((resolve) => setTimeout(resolve, ms));
    const { busyMs, jobMs, wallMs } = await this.stopProfile();
    return { busy: busyMs / wallMs, job: jobMs / wallMs };
  }

  async #send(method: string, params: object = {}): Promise<unknown> {
    const sessionId = this.#sessionId;
    if (sessionId === undefined) {
      throw new Error('No engine worker attached');
    }
    const id = ++this.#nextId;
    const reply = new Promise<{ result?: unknown; error?: unknown }>((resolve) =>
      this.#replies.set(id, resolve),
    );
    await this.#cdp.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({ id, method, params }),
    });
    const { result, error } = await reply;
    if (error !== undefined) {
      throw new Error(`${method}: ${JSON.stringify(error)}`);
    }
    return result;
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Reports a measurement in the test output and the annotations of the report. */
function report(name: string, value: string): void {
  console.info(`J10 ${name}: ${value}`);
  test.info().annotations.push({ type: `J10 ${name}`, description: value });
}

/**
 * Creates a player with a throttled page and measures from „Spieler anlegen“ until the clock shows
 * the game start without overlay; the worker's busy time in that span is profiled.
 */
async function measureGameStart(
  browser: Browser,
): Promise<{ wallMs: number; workerBusyMs: number }> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('#/players/new');
    await page.getByTestId('players.new.name').fill('Anna');
    const probe = await EngineWorkerProbe.attach(page, true);
    // Timed in the page, so that Playwright's polling interval does not count.
    const elapsed = page.evaluate(
      (start) =>
        new Promise<number>((resolve) => {
          const submit = document.querySelector('[data-testid="players.new.submit"]');
          let clickedAt: number | null = null;
          submit?.addEventListener('click', () => (clickedAt = performance.now()), {
            capture: true,
            once: true,
          });
          const check = (): void => {
            const clock = document.querySelector('[data-testid="shell.header.clock"]');
            const overlay = document.querySelector('[data-testid="shell.session-overlay"]');
            if (clickedAt !== null && clock?.textContent?.trim() === start && overlay === null) {
              resolve(performance.now() - clickedAt);
            } else {
              requestAnimationFrame(check);
            }
          };
          requestAnimationFrame(check);
        }),
      GAME_START_TEXT,
    );
    await page.getByTestId('players.new.submit').click();
    const wallMs = await elapsed;
    const { busyMs } = await probe.stopProfile();
    await expect(getClock(page)).toHaveText(GAME_START_TEXT);
    await expect(getSessionOverlay(page)).toBeHidden();
    return { wallMs, workerBusyMs: busyMs };
  } finally {
    await context.close();
  }
}

// `@budget`: wall-clock budgets run outside the deployment gate in CI (TS §14.4).
test.describe('performance with four times CPU throttling (J10)', { tag: '@budget' }, () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CPU throttling needs CDP');

  test('starts a game within the budget', async ({ browser }) => {
    test.setTimeout(120_000);
    const runs: { wallMs: number; workerBusyMs: number; estimateMs: number }[] = [];
    for (let run = 0; run < RUNS; run++) {
      const { wallMs, workerBusyMs } = await measureGameStart(browser);
      // The worker's share of the start would take four times as long on the throttled CPU.
      const estimateMs = wallMs + (CPU_THROTTLING - 1) * workerBusyMs;
      runs.push({ wallMs, workerBusyMs, estimateMs });
    }
    const estimateMs = median(runs.map((run) => run.estimateMs));
    report(
      'game start',
      `${runs
        .map(
          (run) =>
            `${run.wallMs.toFixed(0)} ms (worker ${run.workerBusyMs.toFixed(0)} ms) → ${run.estimateMs.toFixed(0)} ms`,
        )
        .join(
          '; ',
        )}; median ${estimateMs.toFixed(0)} ms (budget ${GAME_START_BUDGET_MS} ms × ${PERF_FACTOR})`,
    );
    expect(estimateMs).toBeLessThanOrEqual(GAME_START_BUDGET_MS * PERF_FACTOR);
  });

  test('runs the engine at 1 w/s within the budget', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('#/players/new');
    const probe = await EngineWorkerProbe.attach(page);
    await page.getByTestId('players.new.name').fill('Anna');
    await page.getByTestId('players.new.submit').click();
    await expectGameReady(page);

    // The candle job of the prehistory runs while paused, within its share of the wall clock.
    const paused = await probe.load(MEASURE_WINDOW_MS);

    await selectSpeed(page, '1w', '1 w/s');
    await resume(page);
    const loads: WorkerLoad[] = [];
    for (let run = 0; run < RUNS; run++) {
      loads.push(await probe.load(MEASURE_WINDOW_MS));
    }
    await expect(getPausedBadge(page)).toBeHidden();
    await expect(page.getByTestId('shell.header.overloaded')).toBeHidden();

    // The budget is the engine's (TS §14.3): the steady state without the candle job, which
    // adds high and low within its own share (TS §6.8).
    const engine = median(loads.map(({ busy, job }) => busy - job));
    const withJob = median(loads.map(({ busy, job }) => CPU_THROTTLING * (busy - job) + job));
    const throttled = CPU_THROTTLING * engine;
    const percent = (value: number): string => `${(value * 100).toFixed(1)} %`;
    report(
      'engine at 1 w/s',
      `worker ${loads.map(({ busy, job }) => `${percent(busy)} (job ${percent(job)})`).join(', ')}; engine median ${percent(engine)} → ×${CPU_THROTTLING} ${percent(throttled)} of a core (budget ${ENGINE_LOAD_BUDGET * 100} % × ${PERF_FACTOR}); with the job ${percent(withJob)}; job while paused ${percent(paused.job)} (worker ${percent(paused.busy)})`,
    );
    expect(throttled).toBeLessThanOrEqual(ENGINE_LOAD_BUDGET * PERF_FACTOR);
  });
});
