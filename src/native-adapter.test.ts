import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NativeFetchAdapter } from './native-adapter';
import type { NativeHandler } from './native-handler-factory';
import type { ResolvedActivateOptions } from './types';

const noopOptions: ResolvedActivateOptions = {
  onUnhandledRequest: () => {},
};

describe('NativeFetchAdapter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    // Safety: always restore
    globalThis.fetch = originalFetch;
  });

  describe('activate', () => {
    it('should replace globalThis.fetch with a mock', () => {
      const adapter = new NativeFetchAdapter();

      adapter.activate(noopOptions);

      expect(globalThis.fetch).not.toBe(originalFetch);

      adapter.deactivate();
    });
  });

  describe('deactivate', () => {
    it('should restore globalThis.fetch to original', () => {
      const adapter = new NativeFetchAdapter();
      adapter.activate(noopOptions);

      adapter.deactivate();

      expect(globalThis.fetch).toBe(originalFetch);
    });
  });

  describe('use', () => {
    it('should register a handler that can match requests', async () => {
      const adapter = new NativeFetchAdapter();
      const handlerFn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
      const handler: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn };

      adapter.activate(noopOptions);
      adapter.use(handler);

      const response = await globalThis.fetch('http://example.com/test');
      expect(response.status).toBe(200);
      expect(handlerFn).toHaveBeenCalled();

      adapter.deactivate();
    });
  });

  describe('resetHandlers', () => {
    it('should replace all handlers with new ones', async () => {
      const adapter = new NativeFetchAdapter();
      const oldFn = vi.fn().mockResolvedValue(new Response('old'));
      const newFn = vi.fn().mockResolvedValue(new Response('new'));
      const oldHandler: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn: oldFn };
      const newHandler: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn: newFn };

      adapter.activate(noopOptions);
      adapter.use(oldHandler);
      adapter.resetHandlers(newHandler);

      await globalThis.fetch('http://example.com/test');
      expect(oldFn).not.toHaveBeenCalled();
      expect(newFn).toHaveBeenCalled();

      adapter.deactivate();
    });

    it('should clear all handlers when called with no arguments', async () => {
      const adapter = new NativeFetchAdapter();
      const onUnhandled = vi.fn();
      const handler: NativeHandler = {
        method: 'GET',
        urlPattern: '/test',
        handlerFn: vi.fn().mockResolvedValue(new Response('ok')),
      };

      adapter.activate({ onUnhandledRequest: onUnhandled });
      adapter.use(handler);
      adapter.resetHandlers();

      await globalThis.fetch('http://example.com/test');
      expect(onUnhandled).toHaveBeenCalled();

      adapter.deactivate();
    });
  });

  describe('unhandled requests', () => {
    it('should call onUnhandledRequest when no handler matches', async () => {
      const adapter = new NativeFetchAdapter();
      const onUnhandled = vi.fn();

      adapter.activate({ onUnhandledRequest: onUnhandled });

      await globalThis.fetch('http://no-match.test/path');

      expect(onUnhandled).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({ warning: expect.any(Function), error: expect.any(Function) })
      );

      adapter.deactivate();
    });

    it('should call onUnhandledRequest when handler returns undefined', async () => {
      const adapter = new NativeFetchAdapter();
      const onUnhandled = vi.fn();
      const handler: NativeHandler = {
        method: 'GET',
        urlPattern: '/test',
        handlerFn: vi.fn().mockResolvedValue(undefined),
      };

      adapter.activate({ onUnhandledRequest: onUnhandled });
      adapter.use(handler);

      await globalThis.fetch('http://example.com/test');
      expect(onUnhandled).toHaveBeenCalled();

      adapter.deactivate();
    });
  });

  describe('multiple handlers', () => {
    it('should try handlers in order and use the first match', async () => {
      const adapter = new NativeFetchAdapter();
      const first = vi.fn().mockResolvedValue(undefined); // no match
      const second = vi.fn().mockResolvedValue(new Response('second'));
      const handler1: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn: first };
      const handler2: NativeHandler = { method: 'GET', urlPattern: '/test', handlerFn: second };

      adapter.activate(noopOptions);
      adapter.use(handler1);
      adapter.use(handler2);

      const response = await globalThis.fetch('http://example.com/test');
      expect(await response.text()).toBe('second');

      adapter.deactivate();
    });
  });
});
