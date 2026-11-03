import { setupServer } from 'msw/node';
import { describe, expect, it, vi } from 'vitest';
import { NodeFetchInterceptor } from './node-interceptor';
import { CLOSED_ORIGIN } from './test-utils';
import { type ResolvedActivateOptions, type SetupServerLike } from './types';

function createStubServer(): SetupServerLike {
	return {
		use: vi.fn(),
		resetHandlers: vi.fn(),
		listen: vi.fn(),
		close: vi.fn(),
	};
}

const noopCallback: ResolvedActivateOptions = {
	onUnhandledRequest: () => {},
	// disabled, so no fetch-options wrapper is installed
	timeout: 0,
	forceConnectionClose: false,
};

describe('NodeFetchInterceptor', () => {
	describe('with external server', () => {
		it('should delegate use() to server', () => {
			const server = createStubServer();
			const adapter = new NodeFetchInterceptor(server);
			const handler = { id: 'handler-1' };

			adapter.use(handler);

			expect(server.use).toHaveBeenCalledWith(handler);
		});

		it('should delegate resetHandlers() to server', () => {
			const server = createStubServer();
			const adapter = new NodeFetchInterceptor(server);
			const handler = { id: 'handler-1' };

			adapter.resetHandlers(handler);

			expect(server.resetHandlers).toHaveBeenCalledWith(handler);
		});

		it('should not call listen() on activate for external server', () => {
			const server = createStubServer();
			const adapter = new NodeFetchInterceptor(server);

			adapter.activate(noopCallback);

			expect(server.listen).not.toHaveBeenCalled();
		});

		it('should not call close() on deactivate for external server', () => {
			const server = createStubServer();
			const adapter = new NodeFetchInterceptor(server);

			adapter.deactivate();

			expect(server.close).not.toHaveBeenCalled();
		});
	});

	describe('standalone (owns server)', () => {
		it('should start intercepting with the given onUnhandledRequest on activate', async () => {
			const adapter = new NodeFetchInterceptor();
			const callback = vi.fn();

			adapter.activate({ ...noopCallback, onUnhandledRequest: callback });
			try {
				// no handlers installed, so the request is unhandled and reaches the callback
				await fetch(`${CLOSED_ORIGIN}/unhandled`).catch(() => null);

				expect(callback).toHaveBeenCalledTimes(1);
				expect((callback.mock.calls[0]?.[0] as Request).url).toBe(`${CLOSED_ORIGIN}/unhandled`);
			} finally {
				adapter.deactivate();
			}
		});

		it('should release its server on deactivate', () => {
			const adapter = new NodeFetchInterceptor();
			adapter.activate(noopCallback);
			adapter.deactivate();

			// had the server stayed active, a new standalone interceptor would refuse to start
			const next = new NodeFetchInterceptor();
			expect(() => next.activate(noopCallback)).not.toThrow();
			next.deactivate();
		});

		it('[AC-2] should throw when another MSW server is already active', () => {
			const externalServer = setupServer();
			externalServer.listen();

			try {
				const adapter = new NodeFetchInterceptor();
				expect(() => adapter.activate(noopCallback)).toThrow(/already active/i);
			} finally {
				externalServer.close();
			}
		});
	});
});
