import { installFetchOptions } from './fetch-options';
import { toMswListenOptions } from './msw-listen-options';
import { type FetchInterceptor, type ResolvedActivateOptions, type SetupServerLike } from './types';

/**
 * Adapts an MSW server (`setupServer()` of MSW v1/v2) to FetchInterceptor.
 *
 * With `manageLifecycle`, activate()/deactivate() also call the server's
 * listen()/close(); without it, the server's owner starts and stops it.
 * Either way, the timeout / forceConnectionClose fetch wrapper is installed
 * on activate() and removed on deactivate().
 */
export class ServerFetchInterceptor implements FetchInterceptor {
	private readonly server: SetupServerLike;
	private readonly manageLifecycle: boolean;
	private removeFetchOptions: () => void = () => {};

	constructor(server: SetupServerLike, options: { manageLifecycle: boolean }) {
		this.server = server;
		this.manageLifecycle = options.manageLifecycle;
	}

	use(...handlers: Array<unknown>): void {
		this.server.use(...handlers);
	}

	resetHandlers(...handlers: Array<unknown>): void {
		this.server.resetHandlers(...handlers);
	}

	listHandlers(): ReadonlyArray<unknown> | undefined {
		return this.server.listHandlers?.();
	}

	activate(options: ResolvedActivateOptions): void {
		if (this.manageLifecycle) {
			this.server.listen(toMswListenOptions(options.onUnhandledRequest));
		}
		this.removeFetchOptions = installFetchOptions(options);
	}

	deactivate(): void {
		this.removeFetchOptions();
		this.removeFetchOptions = () => {};
		if (this.manageLifecycle) {
			this.server.close();
		}
	}
}
