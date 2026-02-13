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

		const isPatched = Object.getOwnPropertySymbols(globalThis.fetch).some(
			(s) => s.description === 'isPatchedModule',
		);
		if (isPatched) {
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
