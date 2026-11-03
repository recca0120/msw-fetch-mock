import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchMock } from './fetch-mock';
import { describeFetchMockContract } from './fetch-mock.contract';
import { createFetchMock, fetchMock as singletonFetchMock } from './node';
import { NodeFetchInterceptor } from './node-interceptor';
import { CLOSED_HOST, CLOSED_ORIGIN, causeCode, useFetchMock } from './test-utils';
import { type FetchInterceptor, type SetupServerLike } from './types';

const API_BASE = 'http://localhost:8787';
const API_PREFIX = 'api';

/**
 * Tracks timers created with the given delay, so assertions only cover our own timers.
 * Install after `vi.useFakeTimers()`; call `restore()` when done.
 */
function trackTimers(ms: number) {
	const realSet = globalThis.setTimeout;
	const realClear = globalThis.clearTimeout;
	const live = new Set<unknown>();
	const setSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
		handler: () => void,
		delay?: number,
		...args: unknown[]
	) => {
		const id = realSet(handler, delay, ...args);
		if (delay === ms) live.add(id);
		return id;
	}) as typeof setTimeout);
	const clearSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation((id) => {
		live.delete(id);
		realClear(id);
	});
	return {
		live: () => [...live],
		restore: () => {
			setSpy.mockRestore();
			clearSpy.mockRestore();
		},
	};
}

describeFetchMockContract('MSW node', createFetchMock);

describe('FetchMock', () => {
	const fetchMock = useFetchMock(createFetchMock);

	describe('external origin', () => {
		it('should intercept requests to a different origin', async () => {
			fetchMock
				.get('https://graph.threads.net')
				.intercept({ path: '/v1.0/user/threads', method: 'POST' })
				.reply(200, { id: 'container_123' });

			const response = await fetch('https://graph.threads.net/v1.0/user/threads', {
				method: 'POST',
				body: JSON.stringify({ text: 'Hello' }),
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ id: 'container_123' });
		});
	});

	describe('reply with callback', () => {
		it('should pass the request to the reply callback and send its result', async () => {
			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({ path: '/posts', method: 'POST' })
				.reply(200, (req: { body: string | null }) => ({ echoed: req.body }));

			const response = await fetch(`${API_BASE}/${API_PREFIX}/posts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: 'Hello' }),
			});

			expect(response.status).toBe(200);
			// the callback receives the raw request body and its return value becomes the JSON reply
			expect(await response.json()).toEqual({ echoed: '{"content":"Hello"}' });
		});
	});

	describe('path function matcher', () => {
		it('should match path using function', async () => {
			fetchMock
				.get('https://graph.threads.net')
				.intercept({
					path: (path: string) => path.startsWith('/v1.0/me'),
					method: 'GET',
				})
				.reply(200, { id: 'user-1', name: 'Test User' });

			const response = await fetch('https://graph.threads.net/v1.0/me?fields=id,name');

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ id: 'user-1', name: 'Test User' });
		});

		it('should capture path in function matcher', async () => {
			let capturedPath = '';

			fetchMock
				.get('https://graph.threads.net')
				.intercept({
					path: (path: string) => {
						if (path.startsWith('/v1.0/me')) {
							capturedPath = path;
							return true;
						}
						return false;
					},
					method: 'GET',
				})
				.reply(200, { id: 'user-1' });

			await fetch('https://graph.threads.net/v1.0/me?fields=id,name');

			expect(capturedPath).toBe('/v1.0/me?fields=id,name');
		});

		it('should receive path relative to origin when origin has path prefix', async () => {
			let capturedPath = '';

			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({
					path: (path: string) => {
						capturedPath = path;
						return path.startsWith('/posts');
					},
					method: 'GET',
				})
				.reply(200, { posts: [] });

			await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10&offset=20`);

			expect(capturedPath).toBe('/posts?limit=10&offset=20');
		});
	});

	describe('headers matching in intercept', () => {
		it('should match request headers', async () => {
			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({
					path: '/models',
					method: 'GET',
					headers: { Authorization: 'Bearer test-api-key' },
				})
				.reply(200, { models: [] });

			const response = await fetch(`${API_BASE}/${API_PREFIX}/models`, {
				headers: { Authorization: 'Bearer test-api-key' },
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ models: [] });
		});
	});

	describe('body matching in intercept', () => {
		it('should match request body using function', async () => {
			const expectedBody = { prompt: 'Hello', model: 'gpt-4' };

			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({
					path: '/completions',
					method: 'POST',
					body: (body) => {
						const parsed = JSON.parse(body);
						return JSON.stringify(parsed) === JSON.stringify(expectedBody);
					},
				})
				.reply(200, { text: 'Hi there' });

			const response = await fetch(`${API_BASE}/${API_PREFIX}/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(expectedBody),
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ text: 'Hi there' });
		});
	});
});

describe('query matching', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should match exact query params', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET', query: { limit: '10', offset: '20' } })
			.reply(200, { posts: [] });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10&offset=20`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ posts: [] });
	});

	it('should not match when query params differ', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET', query: { limit: '10' } })
			.reply(200, { posts: [] });

		// fetch with different query - should NOT match, so the interceptor stays pending
		await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=99`).catch(() => null);

		// Clean up: the interceptor was not consumed
		expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
		fetchMock.reset();
	});

	it('should match query params regardless of order', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET', query: { offset: '20', limit: '10' } })
			.reply(200, { posts: [] });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10&offset=20`);

		expect(response.status).toBe(200);
	});

	it('should match when path includes query string - exact match', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts?limit=10', method: 'GET' })
			.reply(200, { posts: [] });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ posts: [] });
	});

	it('should not match when path includes query string but request query differs', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts?limit=10', method: 'GET' })
			.reply(200, { posts: [] });

		// fetch with different query - should NOT match
		await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=20`).catch(() => null);

		// Clean up: the interceptor was not consumed
		expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
		fetchMock.reset();
	});

	it('should match when path includes query string regardless of param order', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts?a=1&b=2', method: 'GET' })
			.reply(200, { posts: [] });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/posts?b=2&a=1`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ posts: [] });
	});

	it('should throw error when both path query and query param are provided', () => {
		expect(() => {
			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({ path: '/posts?a=1', method: 'GET', query: { b: '2' } });
		}).toThrow(/cannot use both/i);
	});

	it('should match when path is RegExp with query string', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: /^\/posts\?limit=\d+$/, method: 'GET' })
			.reply(200, { posts: [] });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ posts: [] });
	});

	it('should match when path is function that checks query string', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({
				path: (path: string) => path.includes('?') && path.includes('limit'),
				method: 'GET',
			})
			.reply(200, { posts: [] });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ posts: [] });
	});
});

describe('times', () => {
	// some tests intentionally leave interceptors pending
	const fetchMock = useFetchMock(createFetchMock, { verifyNoPending: false });

	it('should be pending when not all times consumed', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true })
			.times(3);

		await fetch(`${API_BASE}/${API_PREFIX}/health`);

		expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
	});
});

describe('pendingInterceptors', () => {
	// some tests intentionally leave interceptors pending
	const fetchMock = useFetchMock(createFetchMock, { verifyNoPending: false });

	it('should return empty array when no interceptors', () => {
		expect(fetchMock.pendingInterceptors()).toEqual([]);
	});

	it('should return pending interceptors with metadata', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET' })
			.reply(200, { posts: [] });

		const pending = fetchMock.pendingInterceptors();

		expect(pending).toHaveLength(1);
		expect(pending[0]).toMatchObject({
			origin: `${API_BASE}/${API_PREFIX}`,
			path: '/posts',
			method: 'GET',
			consumed: false,
			timesInvoked: 0,
			times: 1,
			persist: false,
		});

		// Clean up
		await fetch(`${API_BASE}/${API_PREFIX}/posts`);
		fetchMock.assertNoPendingInterceptors();
	});

	it('should track timesInvoked for times(n)', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true })
			.times(3);

		await fetch(`${API_BASE}/${API_PREFIX}/health`);
		await fetch(`${API_BASE}/${API_PREFIX}/health`);

		const pending = fetchMock.pendingInterceptors();
		expect(pending).toHaveLength(1);
		expect(pending[0]).toMatchObject({
			timesInvoked: 2,
			times: 3,
			consumed: false,
		});

		// Consume remaining
		await fetch(`${API_BASE}/${API_PREFIX}/health`);
		fetchMock.assertNoPendingInterceptors();
	});

	it('should not include consumed one-shot interceptors', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true });

		await fetch(`${API_BASE}/${API_PREFIX}/health`);

		expect(fetchMock.pendingInterceptors()).toHaveLength(0);
		fetchMock.assertNoPendingInterceptors();
	});

	it('should include persist interceptors that have not been invoked', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true })
			.persist();

		const pending = fetchMock.pendingInterceptors();
		expect(pending).toHaveLength(1);
		expect(pending[0]).toMatchObject({ persist: true, timesInvoked: 0 });

		// Uninvoked persist interceptor is pending per undici spec
		expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
	});
});

describe('assertNoPendingInterceptors', () => {
	const fetchMock = createFetchMock();

	beforeEach(async () => {
		await fetchMock.activate();
		fetchMock.disableNetConnect();
	});

	afterEach(() => fetchMock.deactivate());

	it('should pass when all interceptors are consumed', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true });

		await fetch(`${API_BASE}/${API_PREFIX}/health`);

		expect(() => fetchMock.assertNoPendingInterceptors()).not.toThrow();
	});
});

describe('reset', () => {
	const fetchMock = createFetchMock();

	beforeEach(async () => {
		await fetchMock.activate();
		fetchMock.disableNetConnect();
	});

	afterEach(() => fetchMock.deactivate());

	it('should clear interceptors', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true });

		fetchMock.reset();

		expect(fetchMock.pendingInterceptors()).toHaveLength(0);
	});

	it('should clear call history', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true });

		await fetch(`${API_BASE}/${API_PREFIX}/health`);
		expect(fetchMock.calls.length).toBe(1);

		fetchMock.reset();

		expect(fetchMock.calls.length).toBe(0);
	});

	it('should reset MSW handlers so subsequent requests are unhandled', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true })
			.persist();

		fetchMock.reset();

		await expect(fetch(`${API_BASE}/${API_PREFIX}/health`)).rejects.toThrow();
	});

	it('should allow registering new interceptors after reset', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/old', method: 'GET' })
			.reply(200, { old: true });

		fetchMock.reset();

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/new', method: 'GET' })
			.reply(200, { new: true });

		const res = await fetch(`${API_BASE}/${API_PREFIX}/new`);
		expect(await res.json()).toEqual({ new: true });

		fetchMock.reset();
	});
});

describe('call history', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should record request headers', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/data', method: 'GET' })
			.reply(200, { ok: true });

		await fetch(`${API_BASE}/${API_PREFIX}/data`, {
			headers: { Authorization: 'Bearer token-123' },
		});

		const call = fetchMock.calls.lastCall()!;
		expect(call.headers.authorization).toBe('Bearer token-123');
	});

	it('should record searchParams', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET', query: { limit: '10', offset: '20' } })
			.reply(200, { posts: [] });

		await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10&offset=20`);

		const call = fetchMock.calls.lastCall()!;
		expect(call.searchParams).toEqual({ limit: '10', offset: '20' });
	});

	it('should clear call history with calls.clear()', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET' })
			.reply(200, { posts: [] });

		await fetch(`${API_BASE}/${API_PREFIX}/posts`);
		expect(fetchMock.calls.length).toBe(1);

		fetchMock.calls.clear();

		expect(fetchMock.calls.length).toBe(0);
	});

	it('should clear history on deactivate()', async () => {
		try {
			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({ path: '/posts', method: 'GET' })
				.reply(200, { posts: [] });

			await fetch(`${API_BASE}/${API_PREFIX}/posts`);
			expect(fetchMock.calls.length).toBe(1);

			fetchMock.deactivate();
			expect(fetchMock.calls.length).toBe(0);
		} finally {
			// re-activate the shared instance for the remaining tests, even if this one failed
			await fetchMock.activate();
		}
	});

	it('should preserve history on assertNoPendingInterceptors()', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET' })
			.reply(200, { posts: [] });

		await fetch(`${API_BASE}/${API_PREFIX}/posts`);

		fetchMock.assertNoPendingInterceptors();

		expect(fetchMock.calls.length).toBe(1);
	});

	it('should return call history via getCallHistory()', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET' })
			.reply(200, { posts: [] });

		await fetch(`${API_BASE}/${API_PREFIX}/posts`);

		expect(fetchMock.getCallHistory()).toBe(fetchMock.calls);
		expect(fetchMock.getCallHistory().length).toBe(1);
	});

	it('should clear history via clearCallHistory()', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET' })
			.reply(200, { posts: [] });

		await fetch(`${API_BASE}/${API_PREFIX}/posts`);
		expect(fetchMock.calls.length).toBe(1);

		fetchMock.clearCallHistory();

		expect(fetchMock.calls.length).toBe(0);
	});

	it('should record every call with times(n)', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true })
			.times(3);

		for (let i = 0; i < 3; i++) {
			await fetch(`${API_BASE}/${API_PREFIX}/health`);
		}

		expect(fetchMock.calls.length).toBe(3);
	});

	it('should record every call with persist()', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/health', method: 'GET' })
			.reply(200, { ok: true })
			.persist();

		for (let i = 0; i < 5; i++) {
			await fetch(`${API_BASE}/${API_PREFIX}/health`);
		}

		expect(fetchMock.calls.length).toBe(5);
	});
});

describe('enableNetConnect', () => {
	const fetchMock = createFetchMock();

	beforeEach(async () => {
		await fetchMock.activate();
	});

	afterEach(() => fetchMock.deactivate());

	// Blocked requests fail inside fetchMock before any connection is attempted;
	// requests let through reach the closed local port and fail with ECONNREFUSED.
	async function fetchClosedOrigin(): Promise<unknown> {
		return fetch(`${CLOSED_ORIGIN}/test`).catch((e: unknown) => e);
	}

	it('should block unmatched requests when disableNetConnect() is called', async () => {
		fetchMock.disableNetConnect();

		const error = await fetchClosedOrigin();
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toMatch(/fetch/i);
		expect(causeCode(error)).not.toBe('ECONNREFUSED');
	});

	it('should block non-matching host when enableNetConnect(string) is called', async () => {
		fetchMock.disableNetConnect();
		fetchMock.enableNetConnect('allowed.test');

		const error = await fetchClosedOrigin();
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toMatch(/fetch/i);
		expect(causeCode(error)).not.toBe('ECONNREFUSED');
	});

	it.each([
		['without args', undefined],
		['with a host string', CLOSED_HOST],
		['with a RegExp', /^127\.0\.0\.1:/],
		['with a function', (host: string) => host.startsWith('127.0.0.1')],
	] as const)(
		'should let matching requests reach the network when enableNetConnect() is called %s',
		async (_, matcher) => {
			fetchMock.disableNetConnect();
			fetchMock.enableNetConnect(matcher);

			const error = await fetchClosedOrigin();
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).not.toMatch(/request handler/i);
			expect(causeCode(error)).toBe('ECONNREFUSED');
		},
	);
});

describe('streaming body', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should stream response body correctly when reply body is a ReadableStream', async () => {
		const chunks = ['hello', ' ', 'world'];
		const stream = new ReadableStream({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(new TextEncoder().encode(chunk));
				}
				controller.close();
			},
		});

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/stream', method: 'GET' })
			.reply(200, stream);

		const response = await fetch(`${API_BASE}/${API_PREFIX}/stream`);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toBe('hello world');
	});

	it('should not force application/json Content-Type for ReadableStream body', async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('plain text'));
				controller.close();
			},
		});

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/stream-content-type', method: 'GET' })
			.reply(200, stream, { headers: { 'Content-Type': 'text/plain' } });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/stream-content-type`);
		expect(response.headers.get('content-type')).toBe('text/plain');
		expect(await response.text()).toBe('plain text');
	});
});

describe('delay', () => {
	const fetchMock = useFetchMock(createFetchMock);
	// runs before useFetchMock's check: a failed fake-timer test must not leak fake time
	afterEach(() => vi.useRealTimers());

	it('[AC-4] should clear the delay timer when request is aborted (no lingering timers)', async () => {
		vi.useFakeTimers();
		const delayTimers = trackTimers(1000);
		try {
			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({ path: '/abort-timer-cleanup', method: 'GET' })
				.reply(200, { ok: true })
				.delay(1000);

			const controller = new AbortController();
			const fetchPromise = fetch(`${API_BASE}/${API_PREFIX}/abort-timer-cleanup`, {
				signal: controller.signal,
			}).catch(() => {});

			// Abort only once the request is inside the delay (interceptor consumed).
			// In MSW v3 an abort issued earlier never reaches the handler at all.
			for (let i = 0; i < 100 && fetchMock.pendingInterceptors().length > 0; i++) {
				await vi.advanceTimersByTimeAsync(1);
			}
			expect(fetchMock.pendingInterceptors()).toHaveLength(0);
			expect(delayTimers.live()).toHaveLength(1); // the delay timer exists before the abort

			controller.abort();
			await vi.advanceTimersByTimeAsync(0);
			await fetchPromise;

			// our 1000ms delay timer is cleared; other timers (undici's in MSW v3, the
			// fetch-options timeout) are not ours to assert on
			expect(delayTimers.live()).toHaveLength(0);
		} finally {
			delayTimers.restore();
			// restore inside the test: on Node 18, fake timers left on until afterEach stall the runner
			vi.useRealTimers();
		}
	});

	it('should reject with an AbortError when aborted before the request reaches the handler', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/early-abort', method: 'GET' })
			.reply(200, { ok: true })
			.delay(1000);

		try {
			const controller = new AbortController();
			const fetchPromise = fetch(`${API_BASE}/${API_PREFIX}/early-abort`, {
				signal: controller.signal,
			}).catch((e: unknown) => e);
			controller.abort();

			// Same for users in MSW v2 and v3, although in v3 the request never reaches
			// the handler (fetch goes through undici, which checks the signal first).
			expect(((await fetchPromise) as Error).name).toBe('AbortError');
		} finally {
			// v2 consumes the interceptor, v3 leaves it pending: neither is asserted here
			fetchMock.reset();
		}
	});

	it('should reject with an error named AbortError when aborted during the delay', async () => {
		vi.useFakeTimers();
		try {
			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({ path: '/slow-abort-name', method: 'GET' })
				.reply(200, { ok: true })
				.delay(500);

			const controller = new AbortController();
			const fetchPromise = fetch(`${API_BASE}/${API_PREFIX}/slow-abort-name`, {
				signal: controller.signal,
			}).catch((e: unknown) => e);

			// abort 50ms into the 500ms delay
			await vi.advanceTimersByTimeAsync(50);
			controller.abort();

			const error = await fetchPromise;
			expect((error as Error).name).toBe('AbortError');
		} finally {
			// restore inside the test: on Node 18, fake timers left on until afterEach stall the runner
			vi.useRealTimers();
		}
	});
});

describe('retry scenarios', () => {
	const fetchMock = useFetchMock(createFetchMock);
	// runs before useFetchMock's check: a failed fake-timer test must not leak fake time
	afterEach(() => vi.useRealTimers());

	it('should return 503 on first call and 200 on second call (retry scenario)', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/retry', method: 'GET' })
			.reply(503)
			.times(1);
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/retry', method: 'GET' })
			.reply(200, { ok: true })
			.persist();

		const first = await fetch(`${API_BASE}/${API_PREFIX}/retry`);
		expect(first.status).toBe(503);

		const second = await fetch(`${API_BASE}/${API_PREFIX}/retry`);
		expect(second.status).toBe(200);
	});

	it('should handle retry with delay using fake timers', async () => {
		vi.useFakeTimers();
		try {
			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({ path: '/retry-delay', method: 'GET' })
				.reply(503)
				.times(1)
				.delay(500);

			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({ path: '/retry-delay', method: 'GET' })
				.reply(200, { ok: true })
				.persist();

			const firstPromise = fetch(`${API_BASE}/${API_PREFIX}/retry-delay`);
			await vi.advanceTimersByTimeAsync(500);
			const first = await firstPromise;
			expect(first.status).toBe(503);

			const secondPromise = fetch(`${API_BASE}/${API_PREFIX}/retry-delay`);
			await vi.advanceTimersByTimeAsync(500);
			const second = await secondPromise;
			expect(second.status).toBe(200);
		} finally {
			// restore inside the test: on Node 18, fake timers left on until afterEach stall the runner
			vi.useRealTimers();
		}
	});
});

describe('activate guard', () => {
	it('[AC-2] should throw when another standalone fetchMock is already active', async () => {
		// The first one wraps MSW's fetch with the timeout / forceConnectionClose wrapper
		// (on by default); the guard must still see the MSW patch underneath.
		const first = createFetchMock();
		await first.activate();

		try {
			const second = createFetchMock();
			await expect(second.activate()).rejects.toThrow(/already active/i);
		} finally {
			first.deactivate();
		}
	});

	it('[AC-2] should throw when another MSW server is already listening', async () => {
		const externalServer = setupServer();
		externalServer.listen();

		try {
			const standalone = createFetchMock();
			await expect(standalone.activate()).rejects.toThrow(/already active/i);
		} finally {
			externalServer.close();
		}
	});

	it('should not throw when using external server mode', async () => {
		const externalServer = setupServer();
		externalServer.listen();

		try {
			const shared = new FetchMock(new NodeFetchInterceptor(externalServer));
			await expect(shared.activate()).resolves.toBeUndefined();
		} finally {
			externalServer.close();
		}
	});
});

describe('onUnhandledRequest', () => {
	it('should block unhandled requests when onUnhandledRequest is "error"', async () => {
		const fm = createFetchMock();
		await fm.activate({ onUnhandledRequest: 'error' });

		try {
			const error = await fetch(`${CLOSED_ORIGIN}/test`).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toMatch(/fetch/i);
			expect(causeCode(error)).not.toBe('ECONNREFUSED');
		} finally {
			fm.deactivate();
		}
	});

	// Each mode owns the listen() call, so msw-fetch-mock alone decides what is printed:
	// MSW itself must not add warnings or errors ([AC-5]: MSW v3 renamed the option).
	describe.each([
		['standalone', () => createFetchMock()],
		['new FetchMock(server)', () => new FetchMock(setupServer())],
	] as const)('[AC-5] let-through requests (%s)', (_, create) => {
		let warn: ReturnType<typeof vi.spyOn>;
		let error: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			error = vi.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			warn.mockRestore();
			error.mockRestore();
		});

		async function fetchUnhandled(
			options: Parameters<FetchMock['activate']>[0],
			setup?: (fm: FetchMock) => void,
		) {
			const fm = create();
			await fm.activate(options);
			setup?.(fm);
			try {
				return await fetch(`${CLOSED_ORIGIN}/test`).catch((e: unknown) => e);
			} finally {
				await fm.deactivate();
			}
		}

		it('"warn" lets the request through and warns exactly once', async () => {
			const result = await fetchUnhandled({ onUnhandledRequest: 'warn' });

			expect(result).toBeInstanceOf(Error);
			expect((result as Error).message).not.toMatch(/request handler/i);
			expect(causeCode(result)).toBe('ECONNREFUSED');
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0]?.[0]).toMatch(/without a matching request handler/);
			expect(warn.mock.calls[0]?.[0]).toContain(`GET ${CLOSED_ORIGIN}/test`);
			expect(error).not.toHaveBeenCalled();
		});

		it('"bypass" lets the request through silently', async () => {
			const result = await fetchUnhandled({ onUnhandledRequest: 'bypass' });

			expect(result).toBeInstanceOf(Error);
			expect((result as Error).message).not.toMatch(/request handler/i);
			expect(causeCode(result)).toBe('ECONNREFUSED');
			expect(warn).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
		});

		it('a host allowed by enableNetConnect gets through silently even in "error" mode', async () => {
			const result = await fetchUnhandled({ onUnhandledRequest: 'error' }, (fm) =>
				fm.enableNetConnect(CLOSED_HOST),
			);

			expect(result).toBeInstanceOf(Error);
			expect((result as Error).message).not.toMatch(/request handler/i);
			expect(causeCode(result)).toBe('ECONNREFUSED');
			expect(warn).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
		});
	});

	it('should invoke custom callback for unhandled requests', async () => {
		const fm = createFetchMock();
		let capturedUrl = '';
		await fm.activate({
			onUnhandledRequest: (request) => {
				capturedUrl = request.url;
				// Not calling print.error() → request passes through
			},
		});

		try {
			await fetch(`${CLOSED_ORIGIN}/test`).catch(() => null);
			expect(capturedUrl).toBe(`${CLOSED_ORIGIN}/test`);
		} finally {
			fm.deactivate();
		}
	});

	it('should not call server.listen() for external server mode', async () => {
		const externalServer = setupServer();
		externalServer.listen();

		try {
			const fm = new FetchMock(new NodeFetchInterceptor(externalServer));
			// activate() with options should not throw or call listen() again
			await expect(fm.activate({ onUnhandledRequest: 'warn' })).resolves.toBeUndefined();
		} finally {
			externalServer.close();
		}
	});
});

describe('user calls server.resetHandlers() on a server passed to fetchMock', () => {
	// MSW's recommended setup calls `server.resetHandlers()` in afterEach. That also
	// removes fetchMock's catch-all handler; fetchMock must recover on its next use.
	const modes = [
		[
			'createFetchMock(server)',
			() => {
				const server = setupServer();
				server.listen();
				return { server, fm: createFetchMock(server), close: () => server.close() };
			},
		],
		[
			'new FetchMock(server)',
			() => {
				const server = setupServer();
				const fm = new FetchMock(server);
				return { server, fm, close: () => fm.deactivate() };
			},
		],
	] as const;

	for (const [label, setup] of modes) {
		describe(label, () => {
			it('registered intercepts still respond', async () => {
				const { server, fm, close } = setup();
				await fm.activate({ onUnhandledRequest: 'error' });

				try {
					// test 1 … then afterEach:
					server.resetHandlers();

					// test 2 registers an intercept
					fm.get(API_BASE).intercept({ path: '/after-reset' }).reply(200, 'mocked');
					const response = await fetch(`${API_BASE}/after-reset`);

					expect(response.status).toBe(200);
					expect(await response.text()).toBe('mocked');
				} finally {
					close();
				}
			});

			it('"error" still blocks unhandled requests before they reach the network', async () => {
				const { server, fm, close } = setup();
				await fm.activate({ onUnhandledRequest: 'error' });

				try {
					server.resetHandlers();
					fm.get(API_BASE).intercept({ path: '/unused' }).reply(200, 'mocked').persist();

					const error = await fetch(`${CLOSED_ORIGIN}/test`).catch((e: unknown) => e);

					expect(error).toBeInstanceOf(Error);
					expect(causeCode(error)).not.toBe('ECONNREFUSED');
				} finally {
					close();
				}
			});
		});
	}

	// Existing behavior to preserve: once fetchMock is deactivated and the user resets
	// their server, the user's own handlers work exactly as if fetchMock was never there.
	it("createFetchMock(server): after deactivate() + server.resetHandlers(), the user's handlers respond", async () => {
		const server = setupServer(http.get(`${API_BASE}/user-route`, () => HttpResponse.text('user')));
		server.listen({ onUnhandledRequest: 'bypass' });
		const fm = createFetchMock(server);
		await fm.activate({ onUnhandledRequest: 'error' });

		try {
			fm.deactivate();
			server.resetHandlers();

			const response = await fetch(`${API_BASE}/user-route`);
			expect(await response.text()).toBe('user');

			// …and unmatched requests follow the user's own listen() options again
			const error = await fetch(`${CLOSED_ORIGIN}/test`).catch((e: unknown) => e);
			expect(causeCode(error)).toBe('ECONNREFUSED');
		} finally {
			server.close();
		}
	});
});

describe('server passed to fetchMock without listHandlers()', () => {
	it('should install the catch-all only once, so an unhandled request is reported once', async () => {
		// A real server whose wrapper hides listHandlers(), as a minimal SetupServerLike would.
		const real = setupServer();
		real.listen({ onUnhandledRequest: 'bypass' });
		const server: SetupServerLike = {
			use: (...handlers) => real.use(...(handlers as Parameters<typeof real.use>)),
			resetHandlers: (...handlers) =>
				real.resetHandlers(...(handlers as Parameters<typeof real.resetHandlers>)),
			listen: (options) => real.listen(options),
			close: () => real.close(),
		};
		const fm = createFetchMock(server);
		const onUnhandledRequest = vi.fn();
		await fm.activate({ onUnhandledRequest });

		try {
			// each intercept registration must not add another catch-all
			fm.get(API_BASE).intercept({ path: '/1' }).reply(200, 'one');
			fm.get(API_BASE).intercept({ path: '/2' }).reply(200, 'two');
			expect(await (await fetch(`${API_BASE}/1`)).text()).toBe('one');
			expect(await (await fetch(`${API_BASE}/2`)).text()).toBe('two');

			// a duplicated catch-all would run the unhandled path once per copy
			await fetch(`${CLOSED_ORIGIN}/unhandled`).catch(() => null);
			expect(onUnhandledRequest).toHaveBeenCalledTimes(1);
		} finally {
			real.close();
		}
	});
});

describe('[BUG-4] unhandled requests are reported once (node — control group)', () => {
	it('a custom onUnhandledRequest callback runs once per unhandled request', async () => {
		const fm = createFetchMock();
		const onUnhandledRequest = vi.fn();
		await fm.activate({ onUnhandledRequest });
		try {
			await fetch(`${CLOSED_ORIGIN}/unhandled`).catch(() => null);

			expect(onUnhandledRequest).toHaveBeenCalledTimes(1);
		} finally {
			fm.deactivate();
		}
	});

	it('"warn" prints one warning per unhandled request', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fm = createFetchMock();
		await fm.activate({ onUnhandledRequest: 'warn' });
		try {
			await fetch(`${CLOSED_ORIGIN}/unhandled`).catch(() => null);

			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			warn.mockRestore();
			fm.deactivate();
		}
	});
});

describe('consumed interceptor', () => {
	it('should treat consumed interceptor request as unhandled', async () => {
		const captured: string[] = [];
		const fm = createFetchMock();
		await fm.activate({
			onUnhandledRequest: (request) => {
				captured.push(request.url);
			},
		});

		try {
			fm.get(CLOSED_ORIGIN).intercept({ path: '/data', method: 'GET' }).reply(200, { ok: true });

			// Consume the interceptor
			const first = await fetch(`${CLOSED_ORIGIN}/data`);
			expect(first.status).toBe(200);

			// Second request - consumed interceptor should trigger onUnhandledRequest callback
			// (and, since the callback does not error, be let through to the closed port)
			const error = await fetch(`${CLOSED_ORIGIN}/data`).catch((e: unknown) => e);

			expect(captured).toEqual([`${CLOSED_ORIGIN}/data`]);
			expect(causeCode(error)).toBe('ECONNREFUSED');
		} finally {
			fm.deactivate();
		}
	});
});

describe('defaultReplyHeaders', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should add default headers to all replies', async () => {
		fetchMock.defaultReplyHeaders({ 'X-Request-Id': 'abc-123' });

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/data', method: 'GET' })
			.reply(200, { ok: true });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/data`);

		expect(response.headers.get('X-Request-Id')).toBe('abc-123');
	});

	it('should merge default headers with per-reply headers', async () => {
		fetchMock.defaultReplyHeaders({ 'X-Default': 'default-val' });

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/data', method: 'GET' })
			.reply(200, { ok: true }, { headers: { 'X-Custom': 'custom-val' } });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/data`);

		expect(response.headers.get('X-Default')).toBe('default-val');
		expect(response.headers.get('X-Custom')).toBe('custom-val');
	});

	it('should let per-reply headers override default headers', async () => {
		fetchMock.defaultReplyHeaders({ 'X-Override': 'default' });

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/data', method: 'GET' })
			.reply(200, { ok: true }, { headers: { 'X-Override': 'custom' } });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/data`);

		expect(response.headers.get('X-Override')).toBe('custom');
	});

	it('should clear default headers on reset()', async () => {
		fetchMock.defaultReplyHeaders({ 'X-Will-Be-Cleared': 'yes' });
		fetchMock.reset();

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/data', method: 'GET' })
			.reply(200, { ok: true });

		const response = await fetch(`${API_BASE}/${API_PREFIX}/data`);

		expect(response.headers.get('X-Will-Be-Cleared')).toBeNull();
	});
});

describe('get(origin) with RegExp', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should accept RegExp as origin', async () => {
		fetchMock
			.get(/localhost/)
			.intercept({ path: '/data', method: 'GET' })
			.reply(200, { matched: true });

		const response = await fetch(`${API_BASE}/data`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ matched: true });
	});
});

describe('get(origin) with function', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should accept function as origin', async () => {
		fetchMock
			.get((origin: string) => origin.includes('localhost'))
			.intercept({ path: '/data', method: 'GET' })
			.reply(200, { matched: true });

		const response = await fetch(`${API_BASE}/data`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ matched: true });
	});
});

describe('clearAllCallHistory', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should be an alias for clearCallHistory()', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET' })
			.reply(200, { posts: [] });

		await fetch(`${API_BASE}/${API_PREFIX}/posts`);
		expect(fetchMock.calls.length).toBe(1);

		fetchMock.clearAllCallHistory();

		expect(fetchMock.calls.length).toBe(0);
	});
});

describe('enableCallHistory / disableCallHistory', () => {
	const fetchMock = useFetchMock(createFetchMock);
	// reset() does not restore call recording, so re-enable it even if a test failed
	afterEach(() => fetchMock.enableCallHistory());

	it('should record calls by default', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET' })
			.reply(200, { posts: [] });

		await fetch(`${API_BASE}/${API_PREFIX}/posts`);

		expect(fetchMock.calls.length).toBe(1);
	});

	it('should not record calls when disableCallHistory() is called', async () => {
		fetchMock.disableCallHistory();

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET' })
			.reply(200, { posts: [] });

		await fetch(`${API_BASE}/${API_PREFIX}/posts`);

		expect(fetchMock.calls.length).toBe(0);
	});

	it('should resume recording after enableCallHistory()', async () => {
		fetchMock.disableCallHistory();
		fetchMock.enableCallHistory();

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/posts', method: 'GET' })
			.reply(200, { posts: [] });

		await fetch(`${API_BASE}/${API_PREFIX}/posts`);

		expect(fetchMock.calls.length).toBe(1);
	});
});

describe('replyContentLength', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should auto-add Content-Length header', async () => {
		const body = { message: 'hello' };

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/data', method: 'GET' })
			.reply(200, body)
			.replyContentLength();

		const response = await fetch(`${API_BASE}/${API_PREFIX}/data`);

		const contentLength = response.headers.get('Content-Length');
		expect(contentLength).not.toBeNull();
		expect(Number(contentLength)).toBe(JSON.stringify(body).length);
	});

	// Content-Length is a byte count of the body actually sent.
	it.each([
		['an ASCII string', 'hello', 5], // 5 ASCII chars = 5 bytes, sent as-is (no JSON quotes)
		['a non-ASCII string', 'héllo', 6], // "é" is 2 bytes in UTF-8
		['a non-ASCII object', { name: 'é' }, 13], // '{"name":"é"}' = 12 chars, 13 bytes
	] as const)(
		'[BUG-2] should set Content-Length to the byte length of %s body',
		async (_, body, bytes) => {
			fetchMock
				.get(`${API_BASE}/${API_PREFIX}`)
				.intercept({ path: '/data', method: 'GET' })
				.reply(200, body)
				.replyContentLength();

			const response = await fetch(`${API_BASE}/${API_PREFIX}/data`);
			const sent = new Uint8Array(await response.arrayBuffer());

			expect(sent.byteLength).toBe(bytes);
			expect(response.headers.get('Content-Length')).toBe(String(bytes));
		},
	);

	it('[BUG-2] should not set Content-Length for a ReadableStream body (length unknown)', async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('streamed'));
				controller.close();
			},
		});
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/stream', method: 'GET' })
			.reply(200, stream)
			.replyContentLength();

		const response = await fetch(`${API_BASE}/${API_PREFIX}/stream`);

		expect(await response.text()).toBe('streamed');
		expect(response.headers.get('Content-Length')).toBeNull();
	});
});

describe('[BUG-3] documented activate() options in MSW (node) mode', () => {
	// ActivateOptions documents `timeout` ("for each fetch request") and
	// `forceConnectionClose` without restricting them to native mode.
	afterEach(() => vi.useRealTimers());

	it('timeout: a reply delayed past the timeout rejects with TimeoutError', async () => {
		vi.useFakeTimers();
		try {
			const fm = createFetchMock();
			await fm.activate({ timeout: 100 });
			try {
				fm.get(API_BASE).intercept({ path: '/slow' }).reply(200, 'late').delay(1000);

				let settled = false;
				const result = fetch(`${API_BASE}/slow`).then(
					() => 'resolved',
					(e: unknown) => (e as Error).name,
				);
				result.finally(() => {
					settled = true;
				});

				await vi.advanceTimersByTimeAsync(100);
				expect(settled).toBe(true);
				expect(await result).toBe('TimeoutError');
			} finally {
				fm.deactivate();
			}
		} finally {
			// restore inside the test: on Node 18, fake timers left on until afterEach stall the runner
			vi.useRealTimers();
		}
	});

	it.each([
		['standalone', () => createFetchMock()],
		['createFetchMock(server)', () => createFetchMock(setupServer())],
		['new FetchMock(server)', () => new FetchMock(setupServer())],
	] as const)('deactivate() restores the original fetch (%s)', async (_, create) => {
		const original = globalThis.fetch;
		const fm = create();
		await fm.activate({ timeout: 100, forceConnectionClose: true });
		expect(globalThis.fetch).not.toBe(original);

		fm.deactivate();

		expect(globalThis.fetch).toBe(original);
	});

	it('[BUG-3] forceConnectionClose: keeps the headers of a Request passed to fetch()', async () => {
		const fm = createFetchMock();
		await fm.activate({ forceConnectionClose: true });
		try {
			fm.get(API_BASE).intercept({ path: '/ping' }).reply(200, 'pong');

			await fetch(new Request(`${API_BASE}/ping`, { headers: { 'x-trace': 'abc' } }));

			const headers = fm.calls.lastCall()?.headers;
			expect(headers?.['x-trace']).toBe('abc');
			expect(headers?.connection).toBe('close');
		} finally {
			fm.deactivate();
		}
	});

	it('forceConnectionClose: requests carry "Connection: close"', async () => {
		const fm = createFetchMock();
		await fm.activate({ forceConnectionClose: true });
		try {
			fm.get(API_BASE).intercept({ path: '/ping' }).reply(200, 'pong');

			await fetch(`${API_BASE}/ping`);

			expect(fm.calls.lastCall()?.headers.connection).toBe('close');
		} finally {
			fm.deactivate();
		}
	});
});

describe('parallel request race condition', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should not let parallel requests match the same one-time handler', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/item', method: 'GET' })
			.reply(200, { id: 1 });

		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/item', method: 'GET' })
			.reply(200, { id: 2 });

		const [res1, res2] = await Promise.all([
			fetch(`${API_BASE}/${API_PREFIX}/item`),
			fetch(`${API_BASE}/${API_PREFIX}/item`),
		]);

		const data1 = await res1.json();
		const data2 = await res2.json();

		const ids = [data1.id, data2.id].sort();
		expect(ids).toEqual([1, 2]);
	});
});

describe('string body serialization', () => {
	const fetchMock = useFetchMock(createFetchMock);

	it('should return string body as-is without double serialization', async () => {
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/text', method: 'GET' })
			.reply(200, 'hello world');

		const response = await fetch(`${API_BASE}/${API_PREFIX}/text`);
		const text = await response.text();

		expect(text).toBe('hello world');
	});

	it('should return JSON string without extra quotes', async () => {
		const jsonString = JSON.stringify({ key: 'value' });
		fetchMock
			.get(`${API_BASE}/${API_PREFIX}`)
			.intercept({ path: '/json-string', method: 'GET' })
			.reply(200, jsonString);

		const response = await fetch(`${API_BASE}/${API_PREFIX}/json-string`);
		const text = await response.text();

		expect(text).toBe(jsonString);
		expect(JSON.parse(text)).toEqual({ key: 'value' });
	});
});

describe('singleton export', () => {
	it('should export fetchMock as a FetchMock instance', () => {
		expect(singletonFetchMock).toBeInstanceOf(FetchMock);
	});
});

describe('constructor auto-detection', () => {
	function createStubServer(): SetupServerLike {
		return {
			use: vi.fn(),
			resetHandlers: vi.fn(),
			listen: vi.fn(),
			close: vi.fn(),
		};
	}

	function createStubAdapter(): FetchInterceptor {
		return {
			use: vi.fn(),
			resetHandlers: vi.fn(),
			activate: vi.fn(),
			deactivate: vi.fn(),
		};
	}

	describe('SetupServerLike', () => {
		it('should call server.listen() on activate', async () => {
			const server = createStubServer();
			const fm = new FetchMock(server);

			await fm.activate();

			expect(server.listen).toHaveBeenCalledWith(
				expect.objectContaining({ onUnhandledRequest: expect.any(Function) }),
			);
		});

		it('should call server.close() on deactivate', () => {
			const server = createStubServer();
			const fm = new FetchMock(server);

			fm.deactivate();

			expect(server.close).toHaveBeenCalled();
		});

		it('should install catch-all handler on activate', async () => {
			const server = createStubServer();
			const fm = new FetchMock(server);
			await fm.activate();

			// activate() installs the catch-all via resetHandlers + use
			expect(server.resetHandlers).toHaveBeenCalled();
			expect(server.use).toHaveBeenCalled();
		});

		it('should not call resetHandlers() on reset() (catch-all persists)', async () => {
			const server = createStubServer();
			const fm = new FetchMock(server);
			await fm.activate();
			vi.mocked(server.resetHandlers).mockClear();

			fm.reset();

			expect(server.resetHandlers).not.toHaveBeenCalled();
		});
	});

	describe('FetchInterceptor (backward compat)', () => {
		it('should use adapter directly on activate', async () => {
			const adapter = createStubAdapter();
			const fm = new FetchMock(adapter);

			await fm.activate();

			expect(adapter.activate).toHaveBeenCalled();
		});

		it('should use adapter directly on deactivate', () => {
			const adapter = createStubAdapter();
			const fm = new FetchMock(adapter);

			fm.deactivate();

			expect(adapter.deactivate).toHaveBeenCalled();
		});
	});

	describe('invalid input', () => {
		it('should throw for an object that matches no known type', () => {
			expect(() => new FetchMock({} as never)).toThrow(/invalid/i);
		});

		it('should throw for another FetchMock instance instead of treating it as an interceptor', () => {
			// A FetchMock has activate()/deactivate(), so it used to pass as a FetchInterceptor.
			const other = new FetchMock(setupServer());

			expect(() => new FetchMock(other as never)).toThrow(
				/FetchMock instance.*setupServer.*setupWorker.*FetchInterceptor/s,
			);
		});
	});

	describe('no args (standalone Node)', () => {
		it('should auto-create standalone adapter and work end-to-end', async () => {
			const fm = new FetchMock();
			await fm.activate();

			try {
				fm.get('http://standalone.test').intercept({ path: '/ping' }).reply(200, { pong: true });

				const res = await fetch('http://standalone.test/ping');
				expect(await res.json()).toEqual({ pong: true });
			} finally {
				fm.deactivate();
			}
		});
	});

	describe('end-to-end with real setupServer', () => {
		it('should intercept and reply when passed setupServer() directly', async () => {
			const server = setupServer();
			const fm = new FetchMock(server);
			await fm.activate();

			try {
				fm.get('http://e2e.test')
					.intercept({ path: '/data' })
					.reply(200, { result: 'auto-detected' });

				const res = await fetch('http://e2e.test/data');
				expect(res.status).toBe(200);
				expect(await res.json()).toEqual({ result: 'auto-detected' });
			} finally {
				fm.deactivate();
			}
		});
	});
});
