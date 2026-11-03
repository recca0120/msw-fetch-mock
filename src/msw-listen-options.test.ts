import { describe, expect, it, vi } from 'vitest';
import { toMswListenOptions } from './msw-listen-options';

type FrameHandler = (args: {
  frame: { data?: { request?: unknown } };
  defaults: { warn(): void; error(): void };
}) => void;

describe('[AC-5] toMswListenOptions', () => {
  it('passes the callback as onUnhandledRequest for MSW v1/v2', () => {
    const callback = vi.fn();

    expect(toMswListenOptions(callback).onUnhandledRequest).toBe(callback);
  });

  it('adapts an MSW v3 HTTP frame to (request, print)', () => {
    const callback = vi.fn();
    const onUnhandledFrame = toMswListenOptions(callback).onUnhandledFrame as FrameHandler;
    const request = new Request('http://example.test/a');
    const defaults = { warn: vi.fn(), error: vi.fn() };

    onUnhandledFrame({ frame: { data: { request } }, defaults });

    expect(callback).toHaveBeenCalledWith(request, {
      warning: defaults.warn,
      error: defaults.error,
    });
  });

  it('ignores frames without a Request (e.g. a WebSocket connection)', () => {
    const callback = vi.fn();
    const onUnhandledFrame = toMswListenOptions(callback).onUnhandledFrame as FrameHandler;
    const defaults = { warn: vi.fn(), error: vi.fn() };

    onUnhandledFrame({ frame: { data: {} }, defaults });

    expect(callback).not.toHaveBeenCalled();
    expect(defaults.warn).not.toHaveBeenCalled();
  });
});
