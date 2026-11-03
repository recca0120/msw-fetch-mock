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

	describe('[AC-9] worker already started by the user (MSW v3 readyState)', () => {
		/**
		 * Fake of an MSW v3 worker: exposes `readyState` (0 = DISABLED) and,
		 * like the real one, throws when start() is called while enabled.
		 */
		function createV3Worker(readyState: number) {
			const worker = {
				readyState,
				use: vi.fn(),
				resetHandlers: vi.fn(),
				start: vi.fn(async () => {
					if (worker.readyState !== 0) {
						throw new Error(
							'[MSW] Failed to call "worker.start()": the worker is already started.',
						);
					}
					worker.readyState = 2;
				}),
				stop: vi.fn(() => {
					worker.readyState = 0;
				}),
			};
			return worker;
		}

		it('should activate without error when the worker is already started', async () => {
			const worker = createV3Worker(2);
			const fm = createFetchMock(worker);

			await expect(fm.activate()).resolves.toBeUndefined();
			expect(worker.start).not.toHaveBeenCalled();
		});

		it('should start the worker when it is not started yet', async () => {
			const worker = createV3Worker(0);
			const fm = createFetchMock(worker);

			await fm.activate();

			expect(worker.start).toHaveBeenCalledTimes(1);
		});

		it('should be able to activate again after deactivate', async () => {
			const worker = createV3Worker(0);
			const fm = createFetchMock(worker);

			await fm.activate();
			fm.deactivate();
			await fm.activate();

			// deactivate() stopped it, so the second activate() must start it again
			expect(worker.start).toHaveBeenCalledTimes(2);
		});
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

			let stopped = false;
			const result = fm.deactivate();
			void Promise.resolve(result).then(() => {
				stopped = true;
			});

			// cleanup still happens synchronously, as before
			expect(fm.pendingInterceptors()).toHaveLength(0);
			expect(result).toBeInstanceOf(Promise);

			await Promise.resolve();
			expect(stopped).toBe(false);

			finishStop();
			await result;
			expect(stopped).toBe(true);
		});
	});
});
