import { setupServer } from 'msw/node';
import type { MswAdapter, ResolvedActivateOptions, SetupServerLike } from './types';

export class NodeMswAdapter implements MswAdapter {
  private server: SetupServerLike | null;
  private readonly ownsServer: boolean;
  private readonly manageLifecycle: boolean;

  constructor(externalServer?: SetupServerLike, options?: { manageLifecycle?: boolean }) {
    this.server = externalServer ?? null;
    this.ownsServer = !externalServer;
    this.manageLifecycle = options?.manageLifecycle ?? this.ownsServer;
  }

  use(...handlers: Array<unknown>): void {
    this.server!.use(...handlers);
  }

  resetHandlers(...handlers: Array<unknown>): void {
    this.server!.resetHandlers(...handlers);
  }

  activate(options: ResolvedActivateOptions): void {
    if (!this.manageLifecycle) return;

    if (this.ownsServer) {
      const isPatched = Object.getOwnPropertySymbols(globalThis.fetch).some(
        (s) => s.description === 'isPatchedModule'
      );
      if (isPatched) {
        throw new Error(
          'Another MSW server is already active. ' +
            'Pass your existing server to new FetchMock(server) instead.'
        );
      }
      this.server = setupServer();
    }

    (this.server as ReturnType<typeof setupServer>).listen({
      onUnhandledRequest: options.onUnhandledRequest,
    });
  }

  deactivate(): void {
    if (!this.manageLifecycle) return;

    this.server?.close();
    if (this.ownsServer) {
      this.server = null;
    }
  }
}
