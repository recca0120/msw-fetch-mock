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
          console.warn(`[msw-fetch-mock] Warning: unhandled ${request.method} ${request.url}`);
        },
        error() {
          throw new TypeError(
            `[msw-fetch-mock] Request handler not found for ${request.method} ${request.url}`
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
