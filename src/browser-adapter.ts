import type { MswAdapter, ResolvedActivateOptions, SetupWorkerLike } from './types';

export class BrowserMswAdapter implements MswAdapter {
  private readonly worker: SetupWorkerLike;

  constructor(worker: SetupWorkerLike) {
    this.worker = worker;
  }

  use(...handlers: Array<unknown>): void {
    this.worker.use(...handlers);
  }

  resetHandlers(...handlers: Array<unknown>): void {
    this.worker.resetHandlers(...handlers);
  }

  async activate(options: ResolvedActivateOptions): Promise<void> {
    await this.worker.start({
      onUnhandledRequest: options.onUnhandledRequest,
    });
  }

  deactivate(): void {
    this.worker.stop();
  }
}
