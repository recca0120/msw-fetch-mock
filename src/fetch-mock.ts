import { MockCallHistory } from './mock-call-history';
import type {
  PathMatcher,
  HeaderValueMatcher,
  BodyMatcher,
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
  ResolvedActivateOptions,
  SetupServerLike,
  SetupWorkerLike,
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

function isPending(p: PendingInterceptor): boolean {
  if (p.persist) return p.timesInvoked === 0;
  return p.timesInvoked < p.times;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesValue(value: string, matcher: string | RegExp | ((v: string) => boolean)): boolean {
  if (typeof matcher === 'string') return value === matcher;
  if (matcher instanceof RegExp) return matcher.test(value);
  return matcher(value);
}

function matchPath(request: Request, origin: string, pathMatcher: PathMatcher): boolean {
  if (typeof pathMatcher === 'string') return true; // string paths are matched by MSW URL pattern
  const url = new URL(request.url);
  const originPrefix = new URL(origin).pathname.replace(/\/$/, '');
  const fullPath = url.pathname + url.search;
  const relativePath = fullPath.startsWith(originPrefix)
    ? fullPath.slice(originPrefix.length)
    : fullPath;
  return matchesValue(relativePath, pathMatcher);
}

function matchQuery(request: Request, query?: Record<string, string>): boolean {
  if (!query) return true;
  const url = new URL(request.url);
  for (const [key, value] of Object.entries(query)) {
    if (url.searchParams.get(key) !== value) return false;
  }
  return true;
}

function matchHeaders(request: Request, headers?: Record<string, HeaderValueMatcher>): boolean {
  if (!headers) return true;
  for (const [key, matcher] of Object.entries(headers)) {
    const value = request.headers.get(key);
    if (value === null || !matchesValue(value, matcher)) return false;
  }
  return true;
}

function matchBody(bodyText: string | null, bodyMatcher?: BodyMatcher): boolean {
  if (!bodyMatcher) return true;
  return matchesValue(bodyText ?? '', bodyMatcher);
}

function recordCall(callHistory: MockCallHistory, request: Request, bodyText: string | null) {
  const url = new URL(request.url);
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    requestHeaders[key] = value;
  });
  const searchParams: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    searchParams[key] = value;
  });
  callHistory.record({
    body: bodyText,
    method: request.method,
    headers: requestHeaders,
    fullUrl: url.origin + url.pathname + url.search,
    origin: url.origin,
    path: url.pathname,
    searchParams,
    protocol: url.protocol,
    host: url.host,
    port: url.port,
    hash: url.hash,
  });
}

function isSetupServerLike(input: unknown): input is SetupServerLike {
  return (
    typeof input === 'object' &&
    input !== null &&
    'listen' in input &&
    typeof (input as SetupServerLike).listen === 'function' &&
    'close' in input &&
    typeof (input as SetupServerLike).close === 'function'
  );
}

function isSetupWorkerLike(input: unknown): input is SetupWorkerLike {
  return (
    typeof input === 'object' &&
    input !== null &&
    'start' in input &&
    typeof (input as SetupWorkerLike).start === 'function' &&
    'stop' in input &&
    typeof (input as SetupWorkerLike).stop === 'function'
  );
}

function isMswAdapter(input: unknown): input is MswAdapter {
  return (
    typeof input === 'object' &&
    input !== null &&
    'activate' in input &&
    typeof (input as MswAdapter).activate === 'function' &&
    'deactivate' in input &&
    typeof (input as MswAdapter).deactivate === 'function'
  );
}

function createServerAdapter(server: SetupServerLike): MswAdapter {
  return {
    use: (...handlers: Array<unknown>) => server.use(...handlers),
    resetHandlers: (...handlers: Array<unknown>) => server.resetHandlers(...handlers),
    activate(options: ResolvedActivateOptions) {
      server.listen({ onUnhandledRequest: options.onUnhandledRequest });
    },
    deactivate() {
      server.close();
    },
  };
}

function createWorkerAdapter(worker: SetupWorkerLike): MswAdapter {
  return {
    use: (...handlers: Array<unknown>) => worker.use(...handlers),
    resetHandlers: (...handlers: Array<unknown>) => worker.resetHandlers(...handlers),
    async activate(options: ResolvedActivateOptions) {
      await worker.start({ onUnhandledRequest: options.onUnhandledRequest });
    },
    deactivate() {
      worker.stop();
    },
  };
}

function resolveAdapter(input?: SetupServerLike | SetupWorkerLike | MswAdapter): MswAdapter {
  if (!input) {
    if (!FetchMock._defaultAdapterFactory) {
      throw new Error(
        'FetchMock requires a server, worker, or adapter argument. ' +
          'Use createFetchMock() from msw-fetch-mock/node or msw-fetch-mock/browser, ' +
          'or pass a setupServer/setupWorker instance directly.'
      );
    }
    return FetchMock._defaultAdapterFactory();
  }
  if (isMswAdapter(input)) return input;
  if (isSetupServerLike(input)) return createServerAdapter(input);
  if (isSetupWorkerLike(input)) return createWorkerAdapter(input);
  throw new Error('Invalid argument: expected a setupServer, setupWorker, or MswAdapter instance.');
}

export class FetchMock {
  /** @internal */
  static _defaultAdapterFactory?: () => MswAdapter;
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

  constructor(input?: SetupServerLike | SetupWorkerLike | MswAdapter) {
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

  get(origin: string | RegExp | ((origin: string) => boolean)): MockPool {
    const originStr =
      typeof origin === 'string'
        ? origin
        : origin instanceof RegExp
          ? origin.toString()
          : '<function>';
    const isNonStringOrigin = typeof origin !== 'string';

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

        let urlPattern: string | RegExp;
        if (typeof origin === 'string') {
          urlPattern =
            typeof options.path === 'string'
              ? `${origin}${options.path}`
              : new RegExp(`^${escapeRegExp(origin)}`);
        } else {
          // Non-string origin: catch all URLs, do manual matching
          urlPattern = /.*/;
        }

        const matchOrigin = (request: Request): boolean => {
          if (typeof origin === 'string') return true;
          const url = new URL(request.url);
          if (origin instanceof RegExp) return origin.test(url.origin);
          return origin(url.origin);
        };

        const matchPathForOrigin = (request: Request): boolean => {
          if (isNonStringOrigin) {
            if (typeof options.path === 'string') {
              const url = new URL(request.url);
              return url.pathname === options.path || url.pathname.endsWith(options.path);
            }
            // Non-string origin + non-string path: match against full pathname+search
            const url = new URL(request.url);
            const fullPath = url.pathname + url.search;
            return matchesValue(fullPath, options.path as RegExp | ((v: string) => boolean));
          }
          return matchPath(request, originStr, options.path);
        };

        const matchAndConsume = async (request: Request) => {
          if (!pending.persist && pending.timesInvoked >= pending.times) return;
          if (!matchOrigin(request)) return;
          if (!matchPathForOrigin(request)) return;
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
        };

        const registerHandler = (
          handlerFn: (request: Request) => Promise<Response | undefined>
        ) => {
          const handler = this.handlerFactory.createHandler(method, urlPattern, handlerFn);
          this.mswHandlers.set(pending, handler);
          this.adapter.use(handler);
        };

        const buildChain = (
          delayRef: { ms: number },
          contentLengthRef: { enabled: boolean }
        ): MockReplyChain => ({
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
        });

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
              registerHandler(async (request) => {
                const bodyText = await matchAndConsume(request);
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
              registerHandler(async (request) => {
                const bodyText = await matchAndConsume(request);
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

            return buildChain(delayRef, contentLengthRef);
          },

          replyWithError: (_error?: Error): MockReplyChain => {
            const delayRef = { ms: 0 };
            const contentLengthRef = { enabled: false };

            registerHandler(async (request) => {
              const bodyText = await matchAndConsume(request);
              if (bodyText === undefined) return;

              return this.handlerFactory.buildErrorResponse();
            });

            return buildChain(delayRef, contentLengthRef);
          },
        };
      },
    };
  }
}
