import { setupServer } from 'msw/node';
import { type FetchInterceptor, type ResolvedActivateOptions, type SetupServerLike } from './types';

/** MSW interceptor that owns and manages its own `setupServer` lifecycle. */
export class NodeFetchInterceptor implements FetchInterceptor {
	private server: SetupServerLike | null;
	private readonly ownsServer: boolean;

	constructor(externalServer?: SetupServerLike) {
		this.server = externalServer ?? null;
		this.ownsServer = !externalServer;
	}

	use(...handlers: Array<unknown>): void {
		this.server?.use(...handlers);
	}

	resetHandlers(...handlers: Array<unknown>): void {
		this.server?.resetHandlers(...handlers);
	}

	activate(options: ResolvedActivateOptions): void {
		if (!this.ownsServer) return;

		// MSW v2 silently reuses interceptors when a second server calls listen().
		// We detect this via @mswjs/interceptors internal Symbols on globalThis.fetch
		// ("isPatchedModule") and globalThis ("fetch"). If these internals change
		// in a future MSW release, the guard fails open (no crash, just shared state).
		// See node-interceptor.test.ts "should throw when another MSW server is already active".
		const isFetchPatched =
			typeof globalThis.fetch === 'function' &&
			Object.getOwnPropertySymbols(globalThis.fetch).some(
				(s) => s.description === 'isPatchedModule',
			);
		const isInterceptorActive = Object.getOwnPropertySymbols(globalThis).some(
			(s) => s.description === 'fetch',
		);
		if (isFetchPatched || isInterceptorActive) {
			throw new Error(
				'Another MSW server is already active. ' +
					'Pass your existing server to new FetchMock(server) instead.',
			);
		}

		this.server = setupServer();
		(this.server as ReturnType<typeof setupServer>).listen({
			onUnhandledRequest: options.onUnhandledRequest,
		});
	}

	deactivate(): void {
		if (this.ownsServer) {
			this.server?.close();
			this.server = null;
		}
	}
}
