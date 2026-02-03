import { describe, it, expect, vi } from 'vitest';
import { BrowserMswAdapter } from './browser-adapter';
import type { SetupWorkerLike, ResolvedActivateOptions } from './types';

function createStubWorker(): SetupWorkerLike {
  return {
    use: vi.fn(),
    resetHandlers: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  };
}

const noopCallback: ResolvedActivateOptions = {
  onUnhandledRequest: () => {},
};

describe('BrowserMswAdapter', () => {
  it('should delegate use() to worker', () => {
    const worker = createStubWorker();
    const adapter = new BrowserMswAdapter(worker);
    const handler = { id: 'handler-1' };

    adapter.use(handler);

    expect(worker.use).toHaveBeenCalledWith(handler);
  });

  it('should delegate resetHandlers() to worker', () => {
    const worker = createStubWorker();
    const adapter = new BrowserMswAdapter(worker);
    const handler = { id: 'handler-1' };

    adapter.resetHandlers(handler);

    expect(worker.resetHandlers).toHaveBeenCalledWith(handler);
  });

  it('should call worker.start() on activate', async () => {
    const worker = createStubWorker();
    const adapter = new BrowserMswAdapter(worker);

    await adapter.activate(noopCallback);

    expect(worker.start).toHaveBeenCalledWith({
      onUnhandledRequest: noopCallback.onUnhandledRequest,
    });
  });

  it('should return a Promise from activate', async () => {
    const worker = createStubWorker();
    const adapter = new BrowserMswAdapter(worker);

    const result = adapter.activate(noopCallback);

    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('should call worker.stop() on deactivate', () => {
    const worker = createStubWorker();
    const adapter = new BrowserMswAdapter(worker);

    adapter.deactivate();

    expect(worker.stop).toHaveBeenCalled();
  });

  it('should pass onUnhandledRequest callback to worker.start()', async () => {
    const worker = createStubWorker();
    const adapter = new BrowserMswAdapter(worker);
    const callback = vi.fn();

    await adapter.activate({ onUnhandledRequest: callback });

    expect(worker.start).toHaveBeenCalledWith({
      onUnhandledRequest: callback,
    });
  });
});
