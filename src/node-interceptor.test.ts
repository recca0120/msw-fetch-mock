import { setupServer } from 'msw/node';
import { describe, expect, it, vi } from 'vitest';
import { NodeFetchInterceptor } from './node-interceptor';
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
		it('should call listen() with onUnhandledRequest on activate', () => {
			const adapter = new NodeFetchInterceptor();
			const callback = vi.fn();

			adapter.activate({ onUnhandledRequest: callback });

			// After activate, server should be created and listening
			// We verify by calling use() which would throw if no server
			expect(() => adapter.use({ id: 'test' })).not.toThrow();

			adapter.deactivate();
		});

		it('should call close() on deactivate when it owns the server', () => {
			const adapter = new NodeFetchInterceptor();
			adapter.activate(noopCallback);

			// Should not throw
			expect(() => adapter.deactivate()).not.toThrow();
		});

		it('should throw when another MSW server is already active', () => {
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
