import { installFetchOptions } from './fetch-options';
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
		await this.worker.start({
			onUnhandledRequest: options.onUnhandledRequest,
		});
		this.removeFetchOptions = installFetchOptions(options);
	}

	deactivate(): void {
		this.removeFetchOptions();
		this.removeFetchOptions = () => {};
		this.worker.stop();
	}
}
