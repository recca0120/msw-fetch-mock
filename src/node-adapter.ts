import { setupServer } from 'msw/node';
import { type MswAdapter, type ResolvedActivateOptions, type SetupServerLike } from './types';

/**
 * MSW adapter that owns and manages its own `setupServer` lifecycle.
 *
 * **Difference from `createServerAdapter` (in fetch-mock.ts):**
 * - `NodeMswAdapter` creates a `setupServer()` on `activate()` and calls
 *   `close()` on `deactivate()` — it owns the server lifecycle.
 * - `createServerAdapter` wraps a user-provided server and does not manage
 *   its lifecycle — the caller owns `listen()` / `close()`.
 *
 * When an external server is passed via the constructor, `NodeMswAdapter`
 * delegates to it without managing lifecycle (similar to `createServerAdapter`).
 */
export class NodeMswAdapter implements MswAdapter {
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

		// Detect whether another MSW server has already called listen() and
		// patched globalThis.fetch.
		//
		// Why this approach:
		//   MSW v2 does NOT throw when a second server calls listen() — it
		//   silently reuses the running @mswjs/interceptors instance.  There is
		//   also no public API on SetupServer to query whether it is active.
		//
		//   @mswjs/interceptors marks globalThis.fetch with a well-known Symbol
		//   ("isPatchedModule") immediately after it wraps the native fetch.
		//   Checking for that symbol is the only reliable in-process signal that
		//   a fetch interceptor is already running.
		//
		//   We additionally check globalThis itself for the interceptor's own
		//   instance-tracking symbol (description "fetch"), which BatchInterceptor
		//   stores via setInstance() to share state across multiple callers.
		//   Either signal being truthy means an MSW server is already active.
		//
		// Risk / future-proofing:
		//   Both checks depend on @mswjs/interceptors internals.  If a future
		//   MSW release removes or renames these symbols, the guard will silently
		//   stop firing (fail-open) rather than crashing — the second server will
		//   just silently share the interceptor, which is the MSW default.  To
		//   catch a regression, the integration test in node-adapter.test.ts
		//   ("should throw when another MSW server is already active") must keep
		//   passing on every MSW upgrade.
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
