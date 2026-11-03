import { setupServer } from 'msw/node';
import { ServerFetchInterceptor } from './server-interceptor';
import { type FetchInterceptor, type ResolvedActivateOptions, type SetupServerLike } from './types';

/**
 * MSW v2 Node interceptor.
 *
 * - `new NodeFetchInterceptor()`: owns a `setupServer()` it creates on activate()
 *   and closes on deactivate().
 * - `new NodeFetchInterceptor(server)`: uses the given server; its owner starts
 *   and stops it.
 */
export class NodeFetchInterceptor implements FetchInterceptor {
	private readonly ownsServer: boolean;
	private current: ServerFetchInterceptor | null;

	constructor(externalServer?: SetupServerLike) {
		this.ownsServer = !externalServer;
		this.current = externalServer
			? new ServerFetchInterceptor(externalServer, { manageLifecycle: false })
			: null;
	}

	use(...handlers: Array<unknown>): void {
		this.current?.use(...handlers);
	}

	resetHandlers(...handlers: Array<unknown>): void {
		this.current?.resetHandlers(...handlers);
	}

	listHandlers(): ReadonlyArray<unknown> | undefined {
		return this.current?.listHandlers();
	}

	activate(options: ResolvedActivateOptions): void {
		if (this.ownsServer) {
			assertNoOtherMswServer();
			this.current = new ServerFetchInterceptor(setupServer(), { manageLifecycle: true });
		}
		this.current?.activate(options);
	}

	deactivate(): void {
		this.current?.deactivate();
		if (this.ownsServer) {
			this.current = null;
		}
	}
}

/**
 * MSW v2 silently reuses interceptors when a second server calls listen().
 * We detect this via @mswjs/interceptors internal Symbols on globalThis.fetch
 * ("isPatchedModule") and globalThis ("fetch"). If these internals change
 * in a future MSW release, the guard fails open (no crash, just shared state).
 * See node-interceptor.test.ts "should throw when another MSW server is already active".
 */
function assertNoOtherMswServer(): void {
	const isFetchPatched =
		typeof globalThis.fetch === 'function' &&
		Object.getOwnPropertySymbols(globalThis.fetch).some((s) => s.description === 'isPatchedModule');
	const isInterceptorActive = Object.getOwnPropertySymbols(globalThis).some(
		(s) => s.description === 'fetch',
	);
	if (isFetchPatched || isInterceptorActive) {
		throw new Error(
			'Another MSW server is already active. ' +
				'Pass your existing server to new FetchMock(server) instead.',
		);
	}
}
