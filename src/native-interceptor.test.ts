import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { type NativeHandler } from './native-handler-factory';
import { NativeFetchInterceptor } from './native-interceptor';
import { type ResolvedActivateOptions } from './types';

const noopOptions: ResolvedActivateOptions = {
	onUnhandledRequest: () => {},
	timeout: 0, // disabled
	forceConnectionClose: false,
};

describe('NativeFetchInterceptor', () => {
	let originalFetch: typeof globalThis.fetch;
	/**
	 * Stands in for the real network: the interceptor captures `globalThis.fetch` on
	 * activate and passes unhandled requests to it, so no test can reach the internet.
	 */
	let network: Mock<typeof globalThis.fetch>;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		network = vi.fn<typeof globalThis.fetch>(async () => new Response('from network'));
		globalThis.fetch = network;
	});

	afterEach(() => {
		// Safety: always restore
		vi.useRealTimers();
		globalThis.fetch = originalFetch;
	});

	describe('activate', () => {
		it('should replace globalThis.fetch with a mock', () => {
			const adapter = new NativeFetchInterceptor();

			adapter.activate(noopOptions);

			expect(globalThis.fetch).not.toBe(network);

			adapter.deactivate();
		});
	});

	describe('deactivate', () => {
		it('should restore globalThis.fetch to original', () => {
			const adapter = new NativeFetchInterceptor();
			adapter.activate(noopOptions);

			adapter.deactivate();

			// restores whatever fetch was installed when it was activated
			expect(globalThis.fetch).toBe(network);
		});
	});

	describe('use', () => {
		it('should register a handler that can match requests', async () => {
			const adapter = new NativeFetchInterceptor();
			const handlerFn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
			const handler: NativeHandler = { handlerFn };

			adapter.activate(noopOptions);
			adapter.use(handler);

			const response = await globalThis.fetch('http://example.com/test');
			expect(response.status).toBe(200);
			expect(handlerFn).toHaveBeenCalled();

			adapter.deactivate();
		});
	});

	describe('resetHandlers', () => {
		it('should replace all handlers with new ones', async () => {
			const adapter = new NativeFetchInterceptor();
			const oldFn = vi.fn().mockResolvedValue(new Response('old'));
			const newFn = vi.fn().mockResolvedValue(new Response('new'));
			const oldHandler: NativeHandler = { handlerFn: oldFn };
			const newHandler: NativeHandler = { handlerFn: newFn };

			adapter.activate(noopOptions);
			adapter.use(oldHandler);
			adapter.resetHandlers(newHandler);

			await globalThis.fetch('http://example.com/test');
			expect(oldFn).not.toHaveBeenCalled();
			expect(newFn).toHaveBeenCalled();

			adapter.deactivate();
		});

		it('should clear all handlers when called with no arguments', async () => {
			const adapter = new NativeFetchInterceptor();
			const onUnhandled = vi.fn();
			const handler: NativeHandler = {
				handlerFn: vi.fn().mockResolvedValue(new Response('ok')),
			};

			adapter.activate({
				onUnhandledRequest: onUnhandled,
				timeout: 0,
				forceConnectionClose: false,
			});
			adapter.use(handler);
			adapter.resetHandlers();

			await globalThis.fetch('http://example.com/test');
			expect(onUnhandled).toHaveBeenCalled();
			expect(network).toHaveBeenCalledTimes(1);

			adapter.deactivate();
		});
	});

	describe('unhandled requests', () => {
		it('should call onUnhandledRequest when no handler matches', async () => {
			const adapter = new NativeFetchInterceptor();
			const onUnhandled = vi.fn();

			adapter.activate({
				onUnhandledRequest: onUnhandled,
				timeout: 0,
				forceConnectionClose: false,
			});

			// The callback doesn't call print.error(), so the request is passed to the network
			const response = await globalThis.fetch('http://example.com/path');

			expect(onUnhandled).toHaveBeenCalledWith(
				expect.any(Request),
				expect.objectContaining({ warning: expect.any(Function), error: expect.any(Function) }),
			);
			expect(await response.text()).toBe('from network');

			adapter.deactivate();
		});

		// Like MSW: a handler that ran but returned nothing handled the request as a
		// passthrough; FetchMock's catch-all has already applied the unhandled policy.
		it('should pass through without calling onUnhandledRequest when a handler returns undefined', async () => {
			const adapter = new NativeFetchInterceptor();
			const onUnhandled = vi.fn();
			const handler: NativeHandler = {
				handlerFn: vi.fn().mockResolvedValue(undefined),
			};

			adapter.activate({
				onUnhandledRequest: onUnhandled,
				timeout: 0,
				forceConnectionClose: false,
			});
			adapter.use(handler);

			await globalThis.fetch('http://example.com/test');
			expect(onUnhandled).not.toHaveBeenCalled();
			expect(network).toHaveBeenCalledTimes(1);

			adapter.deactivate();
		});
	});

	describe('multiple handlers', () => {
		it('should try handlers in order and use the first match', async () => {
			const adapter = new NativeFetchInterceptor();
			const first = vi.fn().mockResolvedValue(undefined); // no match
			const second = vi.fn().mockResolvedValue(new Response('second'));
			const handler1: NativeHandler = { handlerFn: first };
			const handler2: NativeHandler = { handlerFn: second };

			adapter.activate(noopOptions);
			adapter.use(handler1);
			adapter.use(handler2);

			const response = await globalThis.fetch('http://example.com/test');
			expect(await response.text()).toBe('second');

			adapter.deactivate();
		});
	});

	describe('timeout', () => {
		// The interceptor tries every handler for every request, so each one checks its path.
		const neverResolves: NativeHandler = {
			handlerFn: (req) =>
				new URL(req.url).pathname === '/slow' ? new Promise(() => {}) : Promise.resolve(undefined),
		};
		const respondsOk: NativeHandler = {
			handlerFn: (req) =>
				Promise.resolve(new URL(req.url).pathname === '/fast' ? new Response('ok') : undefined),
		};

		/** Starts a fetch and tracks whether it settled, without awaiting it. */
		function track(promise: Promise<Response>) {
			const state: { settled: boolean; error?: unknown } = { settled: false };
			promise.then(
				() => {
					state.settled = true;
				},
				(error: unknown) => {
					state.settled = true;
					state.error = error;
				},
			);
			return state;
		}

		it('should abort request when timeout is reached', async () => {
			vi.useFakeTimers();
			try {
				const adapter = new NativeFetchInterceptor();
				adapter.activate({ ...noopOptions, timeout: 100 });
				adapter.use(neverResolves);

				const state = track(globalThis.fetch('http://example.com/slow'));

				await vi.advanceTimersByTimeAsync(99);
				expect(state.settled).toBe(false);

				await vi.advanceTimersByTimeAsync(1);
				expect(state.settled).toBe(true);
				expect((state.error as Error).name).toBe('TimeoutError');

				adapter.deactivate();
			} finally {
				// restore inside the test: on Node 18, fake timers left on until afterEach stall the runner
				vi.useRealTimers();
			}
		});

		it('should not abort when timeout is 0 (disabled)', async () => {
			vi.useFakeTimers();
			try {
				const adapter = new NativeFetchInterceptor();
				adapter.activate({ ...noopOptions, timeout: 0 });
				adapter.use(neverResolves, respondsOk);

				// a fast request responds normally…
				const response = await globalThis.fetch('http://example.com/fast');
				expect(response.status).toBe(200);

				// …and a slow one is never cut off
				const state = track(globalThis.fetch('http://example.com/slow'));
				await vi.advanceTimersByTimeAsync(60_000);
				expect(state.settled).toBe(false);

				adapter.deactivate();
			} finally {
				// restore inside the test: on Node 18, fake timers left on until afterEach stall the runner
				vi.useRealTimers();
			}
		});

		it('should respect user-provided signal over timeout', async () => {
			vi.useFakeTimers();
			try {
				const adapter = new NativeFetchInterceptor();
				adapter.activate({ ...noopOptions, timeout: 100 });
				adapter.use(neverResolves, respondsOk);
				const userController = new AbortController();

				// User provides their own signal - the request still responds normally…
				const response = await globalThis.fetch('http://example.com/fast', {
					signal: userController.signal,
				});
				expect(response.status).toBe(200);

				// …and the 100ms timeout does not apply
				const state = track(
					globalThis.fetch('http://example.com/slow', { signal: userController.signal }),
				);
				await vi.advanceTimersByTimeAsync(1_000);
				expect(state.settled).toBe(false);

				adapter.deactivate();
			} finally {
				// restore inside the test: on Node 18, fake timers left on until afterEach stall the runner
				vi.useRealTimers();
			}
		});
	});

	describe('forceConnectionClose', () => {
		it('should add Connection: close header when enabled', async () => {
			const adapter = new NativeFetchInterceptor();
			let capturedRequest = null as Request | null; // assigned in the handler
			const handler: NativeHandler = {
				handlerFn: vi.fn((req) => {
					capturedRequest = req;
					return Promise.resolve(new Response('ok'));
				}),
			};

			adapter.activate({
				onUnhandledRequest: () => {},
				timeout: 0,
				forceConnectionClose: true,
			});
			adapter.use(handler);

			await globalThis.fetch('http://example.com/test');
			expect(capturedRequest?.headers.get('Connection')).toBe('close');

			adapter.deactivate();
		});

		it('should not add Connection header when disabled', async () => {
			const adapter = new NativeFetchInterceptor();
			let capturedRequest = null as Request | null; // assigned in the handler
			const handler: NativeHandler = {
				handlerFn: vi.fn((req) => {
					capturedRequest = req;
					return Promise.resolve(new Response('ok'));
				}),
			};

			adapter.activate({
				onUnhandledRequest: () => {},
				timeout: 0,
				forceConnectionClose: false,
			});
			adapter.use(handler);

			await globalThis.fetch('http://example.com/test');
			expect(capturedRequest?.headers.get('Connection')).toBeNull();

			adapter.deactivate();
		});
	});
});
