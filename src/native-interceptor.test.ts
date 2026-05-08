import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		// Safety: always restore
		globalThis.fetch = originalFetch;
	});

	describe('activate', () => {
		it('should replace globalThis.fetch with a mock', () => {
			const adapter = new NativeFetchInterceptor();

			adapter.activate(noopOptions);

			expect(globalThis.fetch).not.toBe(originalFetch);

			adapter.deactivate();
		});
	});

	describe('deactivate', () => {
		it('should restore globalThis.fetch to original', () => {
			const adapter = new NativeFetchInterceptor();
			adapter.activate(noopOptions);

			adapter.deactivate();

			expect(globalThis.fetch).toBe(originalFetch);
		});
	});

	describe('use', () => {
		it('should register a handler that can match requests', async () => {
			const adapter = new NativeFetchInterceptor();
			const handlerFn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
			const handler: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn };

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
			const oldHandler: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn: oldFn };
			const newHandler: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn: newFn };

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
				method: 'GET',
				urlPattern: '/test',
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

			// The noop callback doesn't throw, so the adapter falls through to
			// originalFetch which may fail with a network error — ignore it.
			try {
				await globalThis.fetch('http://127.0.0.1:1/path');
			} catch {
				// expected: real fetch may fail in CI
			}

			expect(onUnhandled).toHaveBeenCalledWith(
				expect.any(Request),
				expect.objectContaining({ warning: expect.any(Function), error: expect.any(Function) }),
			);

			adapter.deactivate();
		});

		it('should call onUnhandledRequest when handler returns undefined', async () => {
			const adapter = new NativeFetchInterceptor();
			const onUnhandled = vi.fn();
			const handler: NativeHandler = {
				method: 'GET',
				urlPattern: '/test',
				handlerFn: vi.fn().mockResolvedValue(undefined),
			};

			adapter.activate({
				onUnhandledRequest: onUnhandled,
				timeout: 0,
				forceConnectionClose: false,
			});
			adapter.use(handler);

			await globalThis.fetch('http://example.com/test');
			expect(onUnhandled).toHaveBeenCalled();

			adapter.deactivate();
		});
	});

	describe('multiple handlers', () => {
		it('should try handlers in order and use the first match', async () => {
			const adapter = new NativeFetchInterceptor();
			const first = vi.fn().mockResolvedValue(undefined); // no match
			const second = vi.fn().mockResolvedValue(new Response('second'));
			const handler1: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn: first };
			const handler2: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn: second };

			adapter.activate(noopOptions);
			adapter.use(handler1);
			adapter.use(handler2);

			const response = await globalThis.fetch('http://example.com/test');
			expect(await response.text()).toBe('second');

			adapter.deactivate();
		});
	});

	describe('timeout', () => {
		it('should abort request when timeout is reached', async () => {
			const adapter = new NativeFetchInterceptor();
			// Handler that never resolves
			const slowHandler: NativeHandler = {
				method: 'GET',
				urlPattern: '/slow',
				handlerFn: () => new Promise(() => {}), // never resolves
			};

			adapter.activate({
				onUnhandledRequest: () => {},
				timeout: 100, // 100ms timeout
				forceConnectionClose: false,
			});
			adapter.use(slowHandler);

			await expect(globalThis.fetch('http://example.com/slow')).rejects.toThrow();

			adapter.deactivate();
		});

		it('should not abort when timeout is 0 (disabled)', async () => {
			const adapter = new NativeFetchInterceptor();
			const fastHandler: NativeHandler = {
				method: 'GET',
				urlPattern: '/fast',
				handlerFn: vi.fn().mockResolvedValue(new Response('ok')),
			};

			adapter.activate({
				onUnhandledRequest: () => {},
				timeout: 0, // disabled
				forceConnectionClose: false,
			});
			adapter.use(fastHandler);

			const response = await globalThis.fetch('http://example.com/fast');
			expect(response.status).toBe(200);

			adapter.deactivate();
		});

		it('should respect user-provided signal over timeout', async () => {
			const adapter = new NativeFetchInterceptor();
			const userController = new AbortController();
			const handler: NativeHandler = {
				method: 'GET',
				urlPattern: '/test',
				handlerFn: vi.fn().mockResolvedValue(new Response('ok')),
			};

			adapter.activate({
				onUnhandledRequest: () => {},
				timeout: 100,
				forceConnectionClose: false,
			});
			adapter.use(handler);

			// User provides their own signal - timeout should be ignored
			const response = await globalThis.fetch('http://example.com/test', {
				signal: userController.signal,
			});
			expect(response.status).toBe(200);

			adapter.deactivate();
		});
	});

	describe('forceConnectionClose', () => {
		it('should add Connection: close header when enabled', async () => {
			const adapter = new NativeFetchInterceptor();
			let capturedRequest: Request | null = null;
			const handler: NativeHandler = {
				method: 'GET',
				urlPattern: '/test',
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
			let capturedRequest: Request | null = null;
			const handler: NativeHandler = {
				method: 'GET',
				urlPattern: '/test',
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
