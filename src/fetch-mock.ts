import { MockCallHistory } from './mock-call-history';
import {
  isPending,
  escapeRegExp,
  matchesValue,
  matchPath,
  matchQuery,
  matchHeaders,
  matchBody,
  recordCall,
} from './matchers';
import { isMswAdapter } from './type-guards';
import type {
  HttpMethod,
  InterceptOptions,
  ReplyOptions,
  ReplyCallback,
  SingleReplyCallback,
  MockReplyChain,
  MockInterceptor,
  MockPool,
  PendingInterceptor,
  NetConnectMatcher,
  ActivateOptions,
  MswAdapter,
  HandlerFactory,
} from './types';

export type {
  InterceptOptions,
  ReplyOptions,
  MockReplyChain,
  MockInterceptor,
  MockPool,
  PendingInterceptor,
  OnUnhandledRequest,
  ActivateOptions,
} from './types';

function resolveAdapter(input?: unknown): MswAdapter {
  if (input && isMswAdapter(input)) return input;

  if (FetchMock._adapterResolver) {
    const adapter = FetchMock._adapterResolver(input);
    if (adapter) return adapter;
  }

  throw new Error(
    input
      ? 'Invalid argument: expected a setupServer, setupWorker, or MswAdapter instance.'
      : 'FetchMock requires a server, worker, or adapter argument. ' +
          'Use createFetchMock() from msw-fetch-mock/node or msw-fetch-mock/browser, ' +
          'or pass a setupServer/setupWorker instance directly.'
  );
}

export class FetchMock {
  /** @internal */
  static _adapterResolver?: (input?: unknown) => MswAdapter | undefined;
  /** @internal */
  static _handlerFactory?: HandlerFactory;

  private get handlerFactory(): HandlerFactory {
    if (!FetchMock._handlerFactory) {
      throw new Error(
        'Handler factory not registered. ' +
          'Import from msw-fetch-mock/node or msw-fetch-mock/browser.'
      );
    }
    return FetchMock._handlerFactory;
  }

  private buildResponse(
    status: number,
    responseBody: unknown,
    replyOptions?: ReplyOptions,
    defaultHeaders?: Record<string, string>,
    addContentLength?: boolean
  ): Response {
    const mergedHeaders: Record<string, string> = { ...defaultHeaders };
    if (replyOptions?.headers) {
      Object.assign(mergedHeaders, replyOptions.headers);
    }
    if (addContentLength && responseBody !== null && responseBody !== undefined) {
      mergedHeaders['Content-Length'] = String(JSON.stringify(responseBody).length);
    }
    const headers = Object.keys(mergedHeaders).length > 0 ? new Headers(mergedHeaders) : undefined;
    return this.handlerFactory.buildResponse(status, responseBody, headers);
  }

  private readonly _calls = new MockCallHistory();
  private adapter: MswAdapter;
  private interceptors: PendingInterceptor[] = [];
  private netConnectAllowed: NetConnectMatcher = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mswHandlers: Map<PendingInterceptor, any> = new Map();
  private _defaultReplyHeaders: Record<string, string> = {};
  private _callHistoryEnabled = true;

  get calls(): MockCallHistory {
    return this._calls;
  }

  constructor(input?: unknown) {
    this.adapter = resolveAdapter(input);
  }

  async activate(options?: ActivateOptions): Promise<void> {
    const mode = options?.onUnhandledRequest ?? 'error';
    await this.adapter.activate({
      onUnhandledRequest: (request: Request, print: { warning(): void; error(): void }) => {
        if (this.isNetConnectAllowed(request)) return;
        if (typeof mode === 'function') {
          mode(request, print);
        } else if (mode === 'error') {
          print.error();
        } else if (mode === 'warn') {
          print.warning();
        }
        // 'bypass' → do nothing
      },
    });
  }

  disableNetConnect(): void {
    this.netConnectAllowed = false;
  }

  enableNetConnect(matcher?: string | RegExp | ((host: string) => boolean)): void {
    this.netConnectAllowed = matcher ?? true;
  }

  private isNetConnectAllowed(request: Request): boolean {
    if (this.netConnectAllowed === true) return true;
    if (this.netConnectAllowed === false) return false;
    const host = new URL(request.url).host;
    if (typeof this.netConnectAllowed === 'string') return host === this.netConnectAllowed;
    if (this.netConnectAllowed instanceof RegExp) return this.netConnectAllowed.test(host);
    return this.netConnectAllowed(host);
  }

  /**
   * Remove consumed MSW handlers so future requests to those URLs
   * go through MSW's onUnhandledRequest instead of silently passing through.
   */
  private syncMswHandlers(): void {
    const activeHandlers = [...this.mswHandlers.entries()]
      .filter(([p]) => !p.consumed || p.persist)
      .map(([, handler]) => handler);
    this.adapter.resetHandlers(...activeHandlers);
  }

  getCallHistory(): MockCallHistory {
    return this._calls;
  }

  clearCallHistory(): void {
    this._calls.clear();
  }

  clearAllCallHistory(): void {
    this.clearCallHistory();
  }

  defaultReplyHeaders(headers: Record<string, string>): void {
    this._defaultReplyHeaders = headers;
  }

  enableCallHistory(): void {
    this._callHistoryEnabled = true;
  }

  disableCallHistory(): void {
    this._callHistoryEnabled = false;
  }

  deactivate(): void {
    this.interceptors = [];
    this.mswHandlers.clear();
    this._calls.clear();
    this.adapter.deactivate();
  }

  reset(): void {
    this.interceptors = [];
    this.mswHandlers.clear();
    this._calls.clear();
    this._defaultReplyHeaders = {};
    this.adapter.resetHandlers();
  }

  assertNoPendingInterceptors(): void {
    const unconsumed = this.interceptors.filter(isPending);
    if (unconsumed.length > 0) {
      const descriptions = unconsumed.map((p) => `  ${p.method} ${p.origin}${p.path}`);
      throw new Error(`Pending interceptor(s) not consumed:\n${descriptions.join('\n')}`);
    }
  }

  pendingInterceptors(): PendingInterceptor[] {
    return this.interceptors.filter(isPending).map((p) => ({ ...p }));
  }

  private resolveUrlPattern(
    origin: string | RegExp | ((origin: string) => boolean),
    path: InterceptOptions['path']
  ): string | RegExp {
    if (typeof origin === 'string') {
      return typeof path === 'string' ? `${origin}${path}` : new RegExp(`^${escapeRegExp(origin)}`);
    }
    // Non-string origin: catch all URLs, do manual matching
    return /.*/;
  }

  private matchOrigin(
    request: Request,
    origin: string | RegExp | ((origin: string) => boolean)
  ): boolean {
    if (typeof origin === 'string') return true;
    const url = new URL(request.url);
    if (origin instanceof RegExp) return origin.test(url.origin);
    return origin(url.origin);
  }

  private matchPathForOrigin(
    request: Request,
    origin: string | RegExp | ((origin: string) => boolean),
    originStr: string,
    path: InterceptOptions['path']
  ): boolean {
    if (typeof origin !== 'string') {
      if (typeof path === 'string') {
        const url = new URL(request.url);
        return url.pathname === path || url.pathname.endsWith(path);
      }
      // Non-string origin + non-string path: match against full pathname+search
      const url = new URL(request.url);
      const fullPath = url.pathname + url.search;
      return matchesValue(fullPath, path as RegExp | ((v: string) => boolean));
    }
    return matchPath(request, originStr, path);
  }

  private async matchAndConsume(
    request: Request,
    pending: PendingInterceptor,
    origin: string | RegExp | ((origin: string) => boolean),
    originStr: string,
    options: InterceptOptions
  ): Promise<string | null | undefined> {
    if (!pending.persist && pending.timesInvoked >= pending.times) return;
    if (!this.matchOrigin(request, origin)) return;
    if (!this.matchPathForOrigin(request, origin, originStr, options.path)) return;
    if (!matchQuery(request, options.query)) return;
    if (!matchHeaders(request, options.headers)) return;

    const bodyText = (await request.text()) || null;
    if (!matchBody(bodyText, options.body)) return;

    pending.timesInvoked++;
    if (!pending.persist && pending.timesInvoked >= pending.times) {
      pending.consumed = true;
      this.syncMswHandlers();
    }

    if (this._callHistoryEnabled) {
      recordCall(this._calls, request, bodyText);
    }
    return bodyText;
  }

  private registerHandler(
    pending: PendingInterceptor,
    method: HttpMethod,
    urlPattern: string | RegExp,
    handlerFn: (request: Request) => Promise<Response | undefined>
  ): void {
    const handler = this.handlerFactory.createHandler(method, urlPattern, handlerFn);
    this.mswHandlers.set(pending, handler);
    this.adapter.use(handler);
  }

  private buildChain(
    pending: PendingInterceptor,
    delayRef: { ms: number },
    contentLengthRef: { enabled: boolean }
  ): MockReplyChain {
    return {
      times(n: number) {
        pending.times = n;
        pending.consumed = false;
      },
      persist() {
        pending.persist = true;
        pending.consumed = false;
      },
      delay(ms: number) {
        delayRef.ms = ms;
      },
      replyContentLength() {
        contentLengthRef.enabled = true;
      },
    };
  }

  get(origin: string | RegExp | ((origin: string) => boolean)): MockPool {
    const originStr =
      typeof origin === 'string'
        ? origin
        : origin instanceof RegExp
          ? origin.toString()
          : '<function>';

    return {
      intercept: (options: InterceptOptions): MockInterceptor => {
        const method = options.method ?? 'GET';
        const pathStr =
          typeof options.path === 'string'
            ? options.path
            : typeof options.path === 'function'
              ? '<function>'
              : options.path.toString();
        const pending: PendingInterceptor = {
          origin: originStr,
          path: pathStr,
          method,
          consumed: false,
          times: 1,
          timesInvoked: 0,
          persist: false,
        };
        this.interceptors.push(pending);

        const urlPattern = this.resolveUrlPattern(origin, options.path);

        return {
          reply: (
            statusOrCallback: number | SingleReplyCallback,
            bodyOrCallback?: unknown | ReplyCallback,
            replyOptions?: ReplyOptions
          ): MockReplyChain => {
            const delayRef = { ms: 0 };
            const contentLengthRef = { enabled: false };

            if (typeof statusOrCallback === 'function') {
              // Single callback form: reply(callback)
              const callback = statusOrCallback;
              this.registerHandler(pending, method, urlPattern, async (request) => {
                const bodyText = await this.matchAndConsume(
                  request,
                  pending,
                  origin,
                  originStr,
                  options
                );
                if (bodyText === undefined) return;

                if (delayRef.ms > 0) {
                  await new Promise((resolve) => setTimeout(resolve, delayRef.ms));
                }

                const result = await callback({ body: bodyText || null });
                return this.buildResponse(
                  result.statusCode,
                  result.data,
                  result.responseOptions,
                  this._defaultReplyHeaders,
                  contentLengthRef.enabled
                );
              });
            } else {
              // Original form: reply(status, body?, options?)
              const status = statusOrCallback;
              this.registerHandler(pending, method, urlPattern, async (request) => {
                const bodyText = await this.matchAndConsume(
                  request,
                  pending,
                  origin,
                  originStr,
                  options
                );
                if (bodyText === undefined) return;

                if (delayRef.ms > 0) {
                  await new Promise((resolve) => setTimeout(resolve, delayRef.ms));
                }

                let responseBody: unknown;
                if (typeof bodyOrCallback === 'function') {
                  responseBody = await (bodyOrCallback as ReplyCallback)({
                    body: bodyText || null,
                  });
                } else {
                  responseBody = bodyOrCallback;
                }

                return this.buildResponse(
                  status,
                  responseBody,
                  replyOptions,
                  this._defaultReplyHeaders,
                  contentLengthRef.enabled
                );
              });
            }

            return this.buildChain(pending, delayRef, contentLengthRef);
          },

          replyWithError: (): MockReplyChain => {
            const delayRef = { ms: 0 };
            const contentLengthRef = { enabled: false };

            this.registerHandler(pending, method, urlPattern, async (request) => {
              const bodyText = await this.matchAndConsume(
                request,
                pending,
                origin,
                originStr,
                options
              );
              if (bodyText === undefined) return;

              return this.handlerFactory.buildErrorResponse();
            });

            return this.buildChain(pending, delayRef, contentLengthRef);
          },
        };
      },
    };
  }
}
