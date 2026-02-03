import { setupServer } from 'msw/node';
import type { MswAdapter, ResolvedActivateOptions, SetupServerLike } from './types';

export class NodeMswAdapter implements MswAdapter {
  private server: SetupServerLike | null;
  private readonly ownsServer: boolean;

  constructor(externalServer?: SetupServerLike) {
    this.server = externalServer ?? null;
    this.ownsServer = !externalServer;
  }

  use(...handlers: Array<unknown>): void {
    this.server!.use(...handlers);
  }

  resetHandlers(...handlers: Array<unknown>): void {
    this.server!.resetHandlers(...handlers);
  }

  activate(options: ResolvedActivateOptions): void {
    if (!this.ownsServer) return;

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
