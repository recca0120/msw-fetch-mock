import { describe, expect, it, vi } from 'vitest';
import { BrowserFetchInterceptor } from './browser-interceptor';
import { type ResolvedActivateOptions, type SetupWorkerLike } from './types';

function createStubWorker(): SetupWorkerLike {
	return {
		use: vi.fn(),
		resetHandlers: vi.fn(),
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn(),
	};
}

const noopCallback: ResolvedActivateOptions = {
	onUnhandledRequest: () => {},
	// disabled, so no fetch-options wrapper is installed
	timeout: 0,
	forceConnectionClose: false,
};

describe('BrowserFetchInterceptor', () => {
	it('should delegate resetHandlers() to worker', () => {
		const worker = createStubWorker();
		const adapter = new BrowserFetchInterceptor(worker);
		const handler = { id: 'handler-1' };

		adapter.resetHandlers(handler);

		expect(worker.resetHandlers).toHaveBeenCalledWith(handler);
	});

	it('should call worker.start() on activate', async () => {
		const worker = createStubWorker();
		const adapter = new BrowserFetchInterceptor(worker);

		await adapter.activate(noopCallback);

		expect(worker.start).toHaveBeenCalledWith({
			onUnhandledRequest: noopCallback.onUnhandledRequest,
		});
	});

	it('should return a Promise from activate', async () => {
		const worker = createStubWorker();
		const adapter = new BrowserFetchInterceptor(worker);

		const result = adapter.activate(noopCallback);

		expect(result).toBeInstanceOf(Promise);
		await result;
	});
});
