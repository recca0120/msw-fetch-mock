import { describe, expect, it, vi } from 'vitest';
import { createFetchMock } from './browser';
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
			onUnhandledFrame: expect.any(Function), // MSW v3's name for the option
		});
	});

	it('should return a Promise from activate', async () => {
		const worker = createStubWorker();
		const adapter = new BrowserFetchInterceptor(worker);

		const result = adapter.activate(noopCallback);

		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	describe('[AC-6] deactivate() waits for worker.stop() (a Promise in MSW v3)', () => {
		it('resolves only after the worker has stopped, with the state already cleared', async () => {
			let finishStop: () => void = () => {};
			const worker: SetupWorkerLike = {
				...createStubWorker(),
				stop: vi.fn(
					() =>
						new Promise<void>((resolve) => {
							finishStop = resolve;
						}),
				),
			};
			const fm = createFetchMock(worker);
			await fm.activate();
			fm.get('http://ac6.test').intercept({ path: '/x' }).reply(200, 'x');

			const settled = vi.fn();
			const result = fm.deactivate().then(settled);

			// cleanup still happens synchronously, as before
			expect(fm.pendingInterceptors()).toHaveLength(0);

			// a macrotask lets every pending microtask run: still waiting for stop()
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(settled).not.toHaveBeenCalled();

			finishStop();
			await result;
			expect(settled).toHaveBeenCalledOnce();
		});

		describe('when worker.stop() fails', () => {
			function createFailingStopWorker(): SetupWorkerLike {
				return {
					...createStubWorker(),
					// a plain function: vi.fn() would attach handlers to the returned promise
					// to record its result, hiding an unhandled rejection
					stop: () => Promise.reject(new Error('stop failed')),
				};
			}

			it('an awaited deactivate() rejects with the error', async () => {
				const fm = createFetchMock(createFailingStopWorker());
				await fm.activate();

				await expect(fm.deactivate()).rejects.toThrow('stop failed');
			});

			it('an unawaited deactivate() (fine before 0.7.0) causes no unhandled rejection', async () => {
				const fm = createFetchMock(createFailingStopWorker());
				await fm.activate();
				const unhandled = vi.fn();
				process.on('unhandledRejection', unhandled);
				try {
					void fm.deactivate();
					// unhandled rejections are reported after the microtask queue drains
					await new Promise((resolve) => setTimeout(resolve, 10));

					expect(unhandled).not.toHaveBeenCalled();
				} finally {
					process.off('unhandledRejection', unhandled);
				}
			});
		});
	});
});
