import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { describe, expect, it } from 'vitest';
import { createFetchMock } from './browser';
import { FetchMock } from './fetch-mock';
import { CLOSED_ORIGIN, causeCode } from './test-utils';
import { type SetupWorkerLike } from './types';

/**
 * A worker backed by a real MSW `setupServer()`, so browser mode can be exercised
 * end to end in Node: start() → listen(), stop() → close(), handlers delegated.
 *
 * By default it follows MSW v2's worker contract: a second start() while started
 * does nothing. With `{ v3: true }` it follows MSW v3's: it exposes `readyState`
 * (0 = disabled), start() throws when already started, and stop() is async.
 */
function createServerBackedWorker(options: { v3?: boolean } = {}) {
  const server = setupServer();
  let started = false;
  const worker = {
    get readyState(): number | undefined {
      if (!options.v3) return undefined;
      return started ? 1 : 0;
    },
    async start(listenOptions?: Record<string, unknown>) {
      if (started) {
        if (options.v3) {
          throw new Error('[MSW] Failed to call "worker.start()": the worker is already started.');
        }
        return;
      }
      server.listen(listenOptions as Parameters<typeof server.listen>[0]);
      started = true;
    },
    stop(): void | Promise<void> {
      if (started) {
        server.close();
        started = false;
      }
      return options.v3 ? Promise.resolve() : undefined;
    },
    use: (...handlers: unknown[]) => server.use(...(handlers as Parameters<typeof server.use>)),
    resetHandlers: (...handlers: unknown[]) =>
      server.resetHandlers(...(handlers as Parameters<typeof server.resetHandlers>)),
    listHandlers: () => server.listHandlers(),
  } satisfies SetupWorkerLike;
  return worker;
}

const ORIGIN = 'http://browser-mode.test';

describe.each([
  ['createFetchMock(worker)', (worker: SetupWorkerLike) => createFetchMock(worker)],
  ['new FetchMock(worker)', (worker: SetupWorkerLike) => new FetchMock(worker)],
] as const)('browser mode via %s', (_, create) => {
  async function withFetchMock(
    options: Parameters<FetchMock['activate']>[0],
    run: (fm: FetchMock, worker: ReturnType<typeof createServerBackedWorker>) => Promise<void>,
  ) {
    const worker = createServerBackedWorker();
    const fm = create(worker);
    await fm.activate(options);
    try {
      await run(fm, worker);
    } finally {
      fm.deactivate();
    }
  }

  it('answers a registered intercept', async () => {
    await withFetchMock(undefined, async (fm) => {
      fm.get(ORIGIN).intercept({ path: '/ping' }).reply(200, 'pong');

      const response = await fetch(`${ORIGIN}/ping`);

      expect(await response.text()).toBe('pong');
    });
  });

  it('"error" blocks an unhandled request before it reaches the network', async () => {
    await withFetchMock({ onUnhandledRequest: 'error' }, async () => {
      const error = await fetch(`${CLOSED_ORIGIN}/unhandled`).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(causeCode(error)).not.toBe('ECONNREFUSED');
    });
  });

  it('keeps answering after the user calls worker.resetHandlers()', async () => {
    await withFetchMock(undefined, async (fm, worker) => {
      worker.resetHandlers();
      fm.get(ORIGIN).intercept({ path: '/after-reset' }).reply(200, 'still mocked');

      const response = await fetch(`${ORIGIN}/after-reset`);

      expect(await response.text()).toBe('still mocked');
    });
  });

  it("reset() keeps the catch-all and the user's own worker handlers", async () => {
    await withFetchMock({ onUnhandledRequest: 'bypass' }, async (fm, worker) => {
      worker.use(http.get(`${ORIGIN}/user`, () => HttpResponse.text('user handler')));
      fm.reset();
      fm.get(ORIGIN).intercept({ path: '/mocked' }).reply(200, 'mocked');

      expect(await (await fetch(`${ORIGIN}/user`)).text()).toBe('user handler');
      expect(await (await fetch(`${ORIGIN}/mocked`)).text()).toBe('mocked');
    });
  });

  it('stops intercepting after deactivate()', async () => {
    const worker = createServerBackedWorker();
    const fm = create(worker);
    await fm.activate({ onUnhandledRequest: 'error' });
    fm.deactivate();

    // the worker was stopped, so the request now really reaches the (closed) port
    const error = await fetch(`${CLOSED_ORIGIN}/after`).catch((e: unknown) => e);
    expect(causeCode(error)).toBe('ECONNREFUSED');
  });
});

describe('[AC-9] a worker the user already started (MSW v3)', () => {
  it('activate() succeeds and registered intercepts are answered', async () => {
    const worker = createServerBackedWorker({ v3: true });
    await worker.start(); // the user's own setup
    const fm = createFetchMock(worker);

    await expect(fm.activate()).resolves.toBeUndefined();
    try {
      fm.get(ORIGIN).intercept({ path: '/ping' }).reply(200, 'pong');

      expect(await (await fetch(`${ORIGIN}/ping`)).text()).toBe('pong');
    } finally {
      await fm.deactivate();
    }
  });

  it('deactivate() leaves the worker running, since fetchMock did not start it', async () => {
    const worker = createServerBackedWorker({ v3: true });
    await worker.start(); // the user's own setup
    const fm = createFetchMock(worker);
    await fm.activate({ onUnhandledRequest: 'bypass' });

    await fm.deactivate();

    expect(worker.readyState).toBe(1);
    // like an external server: once the user resets, their own handlers answer
    worker.resetHandlers(http.get(`${ORIGIN}/user`, () => HttpResponse.text('user handler')));
    expect(await (await fetch(`${ORIGIN}/user`)).text()).toBe('user handler');
    worker.stop();
  });

  it('can be activated again after deactivate()', async () => {
    const worker = createServerBackedWorker({ v3: true });
    const fm = createFetchMock(worker);
    await fm.activate();
    await fm.deactivate();

    await fm.activate();
    try {
      fm.get(ORIGIN).intercept({ path: '/again' }).reply(200, 'again');

      expect(await (await fetch(`${ORIGIN}/again`)).text()).toBe('again');
    } finally {
      await fm.deactivate();
    }
  });
});
