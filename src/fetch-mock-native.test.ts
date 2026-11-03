import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeFetchMockContract } from './fetch-mock.contract';
import { createFetchMock, FetchMock, fetchMock as singletonFetchMock } from './native';
import { CLOSED_ORIGIN } from './test-utils';

const API_BASE = 'http://localhost:8787';

describeFetchMockContract('native', createFetchMock);

describe('documented options (native) — control group for BUG-2 / BUG-3', () => {
	afterEach(() => vi.useRealTimers());

	it('[BUG-2] should set Content-Length to the byte length of a string body', async () => {
		const fm = createFetchMock();
		await fm.activate();
		try {
			fm.get(API_BASE).intercept({ path: '/data' }).reply(200, 'hello').replyContentLength();

			const response = await fetch(`${API_BASE}/data`);

			expect(await response.text()).toBe('hello');
			expect(response.headers.get('Content-Length')).toBe('5'); // 5 ASCII chars = 5 bytes
		} finally {
			fm.deactivate();
		}
	});

	it('[BUG-3] timeout: a reply delayed past the timeout rejects with TimeoutError', async () => {
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

	it('[BUG-3] forceConnectionClose: requests carry "Connection: close"', async () => {
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

describe('[BUG-4] unhandled requests are reported once (native)', () => {
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

describe('singleton export (native)', () => {
	it('should export fetchMock as a FetchMock instance', () => {
		expect(singletonFetchMock).toBeInstanceOf(FetchMock);
	});
});

describe('activate returns promise (native)', () => {
	it('should return a Promise from activate() that resolves once fetch is patched', async () => {
		const before = globalThis.fetch;
		const fm = createFetchMock();
		try {
			const result = fm.activate();
			expect(result).toBeInstanceOf(Promise);
			await expect(result).resolves.toBeUndefined();
			expect(globalThis.fetch).not.toBe(before);
		} finally {
			fm.deactivate();
		}
		expect(globalThis.fetch).toBe(before);
	});
});
