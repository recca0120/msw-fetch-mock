import { withConnectionClose, withTimeout } from './fetch-options';
import { formatUnhandledRequestError, formatUnhandledRequestWarning } from './messages';
import { type NativeHandler } from './native-handler-factory';
import { type FetchInterceptor, type ResolvedActivateOptions } from './types';

export class NativeFetchInterceptor implements FetchInterceptor {
  private originalFetch!: typeof globalThis.fetch;
  private handlers: NativeHandler[] = [];
  private options!: ResolvedActivateOptions;

  activate(options: ResolvedActivateOptions): void {
    this.options = options;
    this.originalFetch = globalThis.fetch;
    // A named function: the duplicate-MSW-server guard treats an anonymous
    // globalThis.fetch as MSW v3's patch, and this is not an MSW server.
    const nativeFetchMock = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const modifiedInit = this.options.forceConnectionClose
        ? withConnectionClose(input, init)
        : init;
      const request = new Request(input, modifiedInit);

      return withTimeout(
        () => this.handleRequest(request, input, modifiedInit),
        this.options.timeout,
        init?.signal,
      );
    };
    globalThis.fetch = nativeFetchMock;
  }

  private async handleRequest(
    request: Request,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    for (const handler of this.handlers) {
      const response = await handler.handlerFn(request);
      if (response !== undefined) {
        if (response.type === 'error') {
          throw new TypeError('Failed to fetch');
        }
        return response;
      }
    }

    // Like MSW: a handler that ran but returned nothing has handled the request
    // as a passthrough (FetchMock's catch-all already applied the unhandled-request
    // policy). Only a request no handler saw at all is "unhandled" here.
    if (this.handlers.length > 0) {
      return this.originalFetch(input, init);
    }

    this.options.onUnhandledRequest(request, {
      warning: () => {
        console.warn(formatUnhandledRequestWarning(request.method, request.url));
      },
      error: () => {
        throw new TypeError(formatUnhandledRequestError(request.method, request.url));
      },
    });

    return this.originalFetch(input, init);
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

  listHandlers(): ReadonlyArray<unknown> {
    return this.handlers;
  }
}
