import { setupServer } from 'msw/node';
import { unwrapFetch } from './fetch-options';
import { ServerFetchInterceptor } from './server-interceptor';
import { type FetchInterceptor, type ResolvedActivateOptions, type SetupServerLike } from './types';

/**
 * MSW v2/v3 Node interceptor.
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
 * A second `setupServer().listen()` silently takes over interception from the first
 * (MSW v2 and v3 alike), breaking the other server's mocks.
 *
 * Detection relies on @mswjs/interceptors internals; if they change in a future MSW
 * release, the guard fails open (no false errors, just shared state).
 * See node-interceptor.test.ts "should throw when another MSW server is already active".
 */
function assertNoOtherMswServer(): void {
	// Look underneath our own timeout / forceConnectionClose wrapper.
	const fetchFn =
		typeof globalThis.fetch === 'function' ? unwrapFetch(globalThis.fetch) : undefined;

	// MSW v2: Symbols on the patched fetch ("isPatchedModule") and on globalThis ("fetch").
	const v2FetchPatched = Object.getOwnPropertySymbols(fetchFn ?? {}).some(
		(s) => s.description === 'isPatchedModule',
	);
	const v2InterceptorActive = Object.getOwnPropertySymbols(globalThis).some(
		(s) => s.description === 'fetch',
	);

	// MSW v3: interceptor state is module-private; the only observable signal is that
	// fetch was replaced by an anonymous arrow function (native fetch is named "fetch").
	// Trade-off: a user-assigned anonymous globalThis.fetch also counts as "active".
	const v3FetchPatched = fetchFn?.name === '';

	if (v2FetchPatched || v2InterceptorActive || v3FetchPatched) {
		throw new Error(
			'Another MSW server is already active. ' +
				'Pass your existing server to new FetchMock(server) instead.',
		);
	}
}
