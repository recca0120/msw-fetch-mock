import { http, HttpResponse, type StrictRequest, type DefaultBodyType } from 'msw';
import { MockCallHistory } from './mock-call-history';
import type {
  HttpMethod,
  PathMatcher,
  HeaderValueMatcher,
  BodyMatcher,
  InterceptOptions,
  ReplyOptions,
  ReplyCallback,
  MockReplyChain,
  MockInterceptor,
  MockPool,
  PendingInterceptor,
  NetConnectMatcher,
  OnUnhandledRequest,
  ActivateOptions,
  MswAdapter,
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

function getHttpMethod(method: HttpMethod) {
  const methods = {
    GET: http.get,
    POST: http.post,
    PUT: http.put,
    DELETE: http.delete,
    PATCH: http.patch,
  };
  return methods[method];
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

function buildResponse(status: number, responseBody: unknown, replyOptions?: ReplyOptions) {
  const headers = replyOptions?.headers ? new Headers(replyOptions.headers) : undefined;
  if (responseBody === null || responseBody === undefined) {
    return new HttpResponse(null, { status, headers });
  }
  return HttpResponse.json(responseBody, { status, headers });
}

export class FetchMock {
  private readonly _calls = new MockCallHistory();
  private adapter: MswAdapter | null;
  private interceptors: PendingInterceptor[] = [];
  private netConnectAllowed: NetConnectMatcher = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mswHandlers: Map<PendingInterceptor, any> = new Map();

  get calls(): MockCallHistory {
    return this._calls;
  }

  constructor(adapter?: MswAdapter) {
    this.adapter = adapter ?? null;
  }

  async activate(options?: ActivateOptions): Promise<void> {
    if (!this.adapter) {
      throw new Error(
        'FetchMock has no adapter. Use createFetchMock() from msw-fetch-mock/node or msw-fetch-mock/browser.'
      );
    }

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
    if (!this.adapter) return;
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

  deactivate(): void {
    this.interceptors = [];
    this.mswHandlers.clear();
    this._calls.clear();
    this.adapter?.deactivate();
  }

  reset(): void {
    this.interceptors = [];
    this.mswHandlers.clear();
    this._calls.clear();
    this.adapter?.resetHandlers();
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

  get(origin: string): MockPool {
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
          origin,
          path: pathStr,
          method,
          consumed: false,
          times: 1,
          timesInvoked: 0,
          persist: false,
        };
        this.interceptors.push(pending);

        const urlPattern =
          typeof options.path === 'string'
            ? `${origin}${options.path}`
            : new RegExp(`^${escapeRegExp(origin)}`);

        const matchAndConsume = async (request: StrictRequest<DefaultBodyType>) => {
          if (!pending.persist && pending.timesInvoked >= pending.times) return;
          if (!matchPath(request, origin, options.path)) return;
          if (!matchQuery(request, options.query)) return;
          if (!matchHeaders(request, options.headers)) return;

          const bodyText = (await request.text()) || null;
          if (!matchBody(bodyText, options.body)) return;

          pending.timesInvoked++;
          if (!pending.persist && pending.timesInvoked >= pending.times) {
            pending.consumed = true;
            this.syncMswHandlers();
          }

          recordCall(this._calls, request, bodyText);
          return bodyText;
        };

        const registerHandler = (
          handlerFn: (request: StrictRequest<DefaultBodyType>) => Promise<Response | undefined>
        ) => {
          const handler = getHttpMethod(method)(
            urlPattern,
            async ({ request }: { request: StrictRequest<DefaultBodyType> }) => handlerFn(request)
          );
          if (!this.adapter) {
            throw new Error(
              'FetchMock has no adapter. Use createFetchMock() from msw-fetch-mock/node or msw-fetch-mock/browser.'
            );
          }
          this.mswHandlers.set(pending, handler);
          this.adapter.use(handler);
        };

        const buildChain = (delayRef: { ms: number }): MockReplyChain => ({
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
        });

        return {
          reply: (
            status: number,
            bodyOrCallback?: unknown | ReplyCallback,
            replyOptions?: ReplyOptions
          ): MockReplyChain => {
            const delayRef = { ms: 0 };

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

              return buildResponse(status, responseBody, replyOptions);
            });

            return buildChain(delayRef);
          },

          replyWithError: (): MockReplyChain => {
            const delayRef = { ms: 0 };

            registerHandler(async (request) => {
              const bodyText = await matchAndConsume(request);
              if (bodyText === undefined) return;

              return HttpResponse.error();
            });

            return buildChain(delayRef);
          },
        };
      },
    };
  }
}
