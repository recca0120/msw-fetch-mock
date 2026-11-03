import { installFetchOptions } from './fetch-options';
import { toMswListenOptions } from './msw-listen-options';
import { type FetchInterceptor, type ResolvedActivateOptions, type SetupWorkerLike } from './types';

export class BrowserFetchInterceptor implements FetchInterceptor {
	private readonly worker: SetupWorkerLike;
	private removeFetchOptions: () => void = () => {};

	constructor(worker: SetupWorkerLike) {
		this.worker = worker;
	}

	use(...handlers: Array<unknown>): void {
		this.worker.use(...handlers);
	}

	resetHandlers(...handlers: Array<unknown>): void {
		this.worker.resetHandlers(...handlers);
	}

	listHandlers(): ReadonlyArray<unknown> | undefined {
		return this.worker.listHandlers?.();
	}

	async activate(options: ResolvedActivateOptions): Promise<void> {
		// MSW v3 throws when start() is called on an already started worker (v2
		// only warned), e.g. one the user started themselves. v3 exposes
		// `readyState` (0 = disabled); v2 has none (undefined), so both mean "start it".
		if (!this.worker.readyState) {
			await this.worker.start(toMswListenOptions(options.onUnhandledRequest));
		}
		this.removeFetchOptions = installFetchOptions(options);
	}

	deactivate(): void | Promise<void> {
		this.removeFetchOptions();
		this.removeFetchOptions = () => {};
		return this.worker.stop();
	}
}
