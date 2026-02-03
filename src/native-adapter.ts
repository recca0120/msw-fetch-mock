import type { MswAdapter, ResolvedActivateOptions } from './types';
import type { NativeHandler } from './native-handler-factory';

export class NativeFetchAdapter implements MswAdapter {
  private originalFetch!: typeof globalThis.fetch;
  private handlers: NativeHandler[] = [];
  private options!: ResolvedActivateOptions;

  activate(options: ResolvedActivateOptions): void {
    this.options = options;
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);

      for (const handler of this.handlers) {
        const response = await handler.handlerFn(request);
        if (response !== undefined) {
          if (response.type === 'error') {
            throw new TypeError('Failed to fetch');
          }
          return response;
        }
      }

      this.options.onUnhandledRequest(request, {
        warning() {
          console.warn(
            `[msw-fetch-mock] Warning: intercepted a request without a matching request handler:\n\n` +
              `  \u2022 ${request.method} ${request.url}\n\n` +
              `If you still wish to intercept this unhandled request, please create a request handler for it.`
          );
        },
        error() {
          throw new TypeError(
            `[msw-fetch-mock] Cannot bypass a request when using the \"error\" strategy for the \"onUnhandledRequest\" option.\n\n` +
              `  \u2022 ${request.method} ${request.url}\n`
          );
        },
      });

      return this.originalFetch(input, init);
    };
  }

  deactivate(): void {
    globalThis.fetch = this.originalFetch;
    this.handlers = [];
  }

  use(...handlers: unknown[]): void {
    this.handlers.push(...(handlers as NativeHandler[]));
  }

  resetHandlers(...handlers: unknown[]): void {
    this.handlers = handlers as NativeHandler[];
  }
}
