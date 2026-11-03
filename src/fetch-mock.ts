import { BrowserFetchInterceptor } from './browser-interceptor';
import {
	describeMatcher,
	isPending,
	matchBody,
	matchesValue,
	matchHeaders,
	matchPath,
	matchQuery,
	recordCall,
} from './matchers';
import { formatUnhandledRequestWarning } from './messages';
import { MockCallHistory } from './mock-call-history';
import { isFetchInterceptor, isSetupServerLike, isSetupWorkerLike } from './type-guards';
import {
	type ActivateOptions,
	type FetchInterceptor,
	type HandlerFactory,
	type InterceptOptions,
	type MockInterceptor,
	type MockPool,
	type MockReplyChain,
	type NetConnectMatcher,
	type OnUnhandledRequestCallback,
	type PendingInterceptor,
	type ReplyCallback,
	type ReplyOptions,
	type ResolvedActivateOptions,
	type SetupServerLike,
	type SetupWorkerLike,
	type SingleReplyCallback,
} from './types';

/**
 * Tries to answer a request for one interceptor; resolves undefined when it does not match.
 * `readBody` reads the request body once per request, shared by all interceptors.
 */
type MatchingHandler = (
	request: Request,
	readBody: () => Promise<string | null>,
) => Promise<Response | undefined>;

import { installFetchOptions } from './fetch-options';

/**
 * UTF-8 byte length of a reply body as it is sent: strings as-is, other values as JSON.
 * Returns undefined when there is no body or its length is unknown (a stream).
 */
function byteLengthOf(body: unknown): number | undefined {
	if (body === null || body === undefined || body instanceof ReadableStream) return undefined;
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	return new TextEncoder().encode(text).byteLength;
}

/** Wraps a user-provided server without managing its lifecycle. */
function wrapServer(server: SetupServerLike): FetchInterceptor {
	let removeFetchOptions: () => void = () => {};
	return {
		use: (...handlers: Array<unknown>) => server.use(...handlers),
		resetHandlers: (...handlers: Array<unknown>) => server.resetHandlers(...handlers),
		listHandlers: () => server.listHandlers?.(),
		activate(options: ResolvedActivateOptions) {
			server.listen({ onUnhandledRequest: options.onUnhandledRequest });
			removeFetchOptions = installFetchOptions(options);
		},
		deactivate() {
			removeFetchOptions();
			removeFetchOptions = () => {};
			server.close();
		},
	};
}

function resolveInterceptor(
	input?: SetupServerLike | SetupWorkerLike | FetchInterceptor,
): FetchInterceptor {
	if (!input) {
		if (!FetchMock._defaultInterceptorFactory) {
			throw new Error(
				'FetchMock requires a server, worker, or interceptor argument. ' +
					'Use createFetchMock() from msw-fetch-mock/node or msw-fetch-mock/browser, ' +
					'or pass a setupServer/setupWorker instance directly.',
			);
		}
		return FetchMock._defaultInterceptorFactory();
	}
	if (isFetchInterceptor(input)) return input;
	if (isSetupServerLike(input)) return wrapServer(input);
	if (isSetupWorkerLike(input)) return new BrowserFetchInterceptor(input);
	throw new Error(
		'Invalid argument: expected a setupServer, setupWorker, or FetchInterceptor instance.',
	);
}

export class FetchMock {
	/** @internal */
	static _defaultInterceptorFactory?: () => FetchInterceptor;
	/** @internal */
	static _handlerFactory?: HandlerFactory;

	private readonly _instanceHandlerFactory?: HandlerFactory;

	private get handlerFactory(): HandlerFactory {
		const factory = this._instanceHandlerFactory ?? FetchMock._handlerFactory;
		if (!factory) {
			throw new Error(
				'Handler factory not registered. ' +
					'Import from msw-fetch-mock/node or msw-fetch-mock/browser.',
			);
		}
		return factory;
	}

	private buildResponse(
		status: number,
		responseBody: unknown,
		replyOptions?: ReplyOptions,
		defaultHeaders?: Record<string, string>,
		addContentLength?: boolean,
	): Response {
		const mergedHeaders: Record<string, string> = { ...defaultHeaders };
		if (replyOptions?.headers) {
			Object.assign(mergedHeaders, replyOptions.headers);
		}
		const contentLength = addContentLength ? byteLengthOf(responseBody) : undefined;
		if (contentLength !== undefined) {
			mergedHeaders['Content-Length'] = String(contentLength);
		}
		const headers = Object.keys(mergedHeaders).length > 0 ? new Headers(mergedHeaders) : undefined;
		return this.handlerFactory.buildResponse(status, responseBody, headers);
	}

	private readonly _calls = new MockCallHistory();
	private interceptor: FetchInterceptor;
	private netConnectAllowed: NetConnectMatcher = false;
	private handlerFns: Map<PendingInterceptor, MatchingHandler> = new Map();
	private _defaultReplyHeaders: Record<string, string> = {};
	private _callHistoryEnabled = true;
	/** The installed catch-all handler; undefined until (re)installed by activate(). */
	private catchAllHandler: unknown;
	private _onUnhandledRequest?: OnUnhandledRequestCallback;

	get calls(): MockCallHistory {
		return this._calls;
	}

	constructor(
		input?: SetupServerLike | SetupWorkerLike | FetchInterceptor,
		handlerFactory?: HandlerFactory,
	) {
		this.interceptor = resolveInterceptor(input);
		this._instanceHandlerFactory = handlerFactory;
	}

	async activate(options?: ActivateOptions): Promise<void> {
		const mode = options?.onUnhandledRequest ?? 'error';
		const timeout = options?.timeout ?? 30000; // Default 30 seconds
		const forceConnectionClose = options?.forceConnectionClose ?? false;

		this._onUnhandledRequest = (request, print) => {
			if (this.isNetConnectAllowed(request)) return;
			if (typeof mode === 'function') {
				mode(request, print);
			} else if (mode === 'error') {
				print.error();
			} else if (mode === 'warn') {
				print.warning();
			}
			// 'bypass' → do nothing
		};

		await this.interceptor.activate({
			onUnhandledRequest: this._onUnhandledRequest,
			timeout,
			forceConnectionClose,
		});

		// Install the catch-all handler eagerly so that it is ready before
		// the first fetch.  In browser environments `worker.use()` must finish
		// before the Service Worker can match requests — doing it once here
		// (behind the already-awaited `activate`) avoids per-test race conditions.
		this.catchAllHandler = undefined;
		this.ensureCatchAllInstalled();
	}

	disableNetConnect(): void {
		this.netConnectAllowed = false;
	}

	enableNetConnect(matcher?: string | RegExp | ((host: string) => boolean)): void {
		this.netConnectAllowed = matcher ?? true;
	}

	private isNetConnectAllowed(request: Request): boolean {
		const allowed = this.netConnectAllowed;
		if (typeof allowed === 'boolean') return allowed;
		return matchesValue(new URL(request.url).host, allowed);
	}

	/**
	 * Installs a single catch-all MSW handler that dispatches requests to
	 * registered interceptors in FIFO order. All matching logic runs in the
	 * main thread, eliminating race conditions with Service Worker messaging.
	 *
	 * The catch-all is installed once and stays active until reset/deactivate.
	 * Adding or consuming interceptors only mutates in-memory data structures,
	 * so no additional interceptor.use() calls are needed.
	 */
	private createCatchAllHandler(): unknown {
		return this.handlerFactory.createCatchAllHandler(async (request: Request) => {
			// Read the body at most once per request, and only once an interceptor's
			// cheap checks (origin, path, method, query, headers) have passed. Reading
			// a clone leaves the original request unread for passthrough.
			let bodyText: Promise<string | null> | undefined;
			const readBody = () => {
				bodyText ??= request
					.clone()
					.text()
					.then((text) => text || null);
				return bodyText;
			};

			// Iterate handlers in FIFO order (insertion order of Map)
			for (const handlerFn of this.handlerFns.values()) {
				const response = await handlerFn(request, readBody);
				if (response !== undefined) return response;
			}

			// No handler matched — invoke the onUnhandledRequest callback
			// (handles net connect checks, error/warn modes, and custom callbacks).
			// Since the catch-all intercepts all requests, MSW's own
			// onUnhandledRequest won't fire, so we replicate it here.
			if (this._onUnhandledRequest) {
				let shouldError = false;
				this._onUnhandledRequest(request, {
					warning: () => {
						console.warn(formatUnhandledRequestWarning(request.method, request.url));
					},
					error: () => {
						shouldError = true;
					},
				});
				if (shouldError) {
					return this.handlerFactory.buildErrorResponse();
				}
			}

			// Allow passthrough for allowed hosts
			return undefined;
		});
	}

	private ensureCatchAllInstalled(): void {
		if (this.catchAllHandler === undefined) {
			this.catchAllHandler = this.createCatchAllHandler();
			this.interceptor.resetHandlers();
			this.interceptor.use(this.catchAllHandler);
			return;
		}

		// Installed, but possibly removed since — e.g. the user called
		// `server.resetHandlers()` on a server passed to fetchMock (MSW's recommended
		// afterEach), which drops all runtime handlers including ours. Re-add it
		// without resetting, so handlers the user added after their reset are kept.
		// Interceptors that cannot list handlers keep the previous behavior.
		const handlers = this.interceptor.listHandlers?.();
		if (handlers && !handlers.includes(this.catchAllHandler)) {
			this.interceptor.use(this.catchAllHandler);
		}
	}

	/**
	 * Returns the call history instance.
	 * Provided for compatibility with the `cloudflare:test` fetchMock API.
	 * Equivalent to the `calls` getter.
	 */
	getCallHistory(): MockCallHistory {
		return this._calls;
	}

	/** Clears recorded call history. Mirrors `cloudflare:test` fetchMock API. */
	clearCallHistory(): void {
		this._calls.clear();
	}

	/** Alias for `clearCallHistory()`. Mirrors `cloudflare:test` fetchMock API. */
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
		this.handlerFns.clear();
		this._calls.clear();
		this.catchAllHandler = undefined;
		this.interceptor.deactivate();
	}

	reset(): void {
		this.handlerFns.clear();
		this._calls.clear();
		this._defaultReplyHeaders = {};
		// The catch-all handler is intentionally kept installed so that no
		// additional interceptor.use() / worker.use() calls are needed between
		// tests.  Because the catch-all reads `this.handlerFns` (now cleared),
		// it will correctly fall through to `_onUnhandledRequest`.
	}

	assertNoPendingInterceptors(): void {
		const unconsumed = this.pendingInterceptors();
		if (unconsumed.length > 0) {
			const descriptions = unconsumed.map((p) => `  ${p.method} ${p.origin}${p.path}`);
			throw new Error(`Pending interceptor(s) not consumed:\n${descriptions.join('\n')}`);
		}
	}

	pendingInterceptors(): PendingInterceptor[] {
		return [...this.handlerFns.keys()].filter(isPending).map((p) => ({ ...p }));
	}

	private matchOriginAndPath(
		request: Request,
		origin: string | RegExp | ((origin: string) => boolean),
		path: InterceptOptions['path'],
	): boolean {
		if (typeof origin === 'string') {
			// String origin: matchPath checks the origin prefix and the path below it.
			return matchPath(request, origin, path);
		}

		// RegExp / function origin: match the origin, then the path on its own.
		const url = new URL(request.url);
		if (!matchesValue(url.origin, origin)) return false;

		if (typeof path === 'string') {
			return url.pathname === path || url.pathname.endsWith(path);
		}

		return matchesValue(url.pathname + url.search, path);
	}

	private async matchAndConsume(
		request: Request,
		readBody: () => Promise<string | null>,
		pending: PendingInterceptor,
		origin: string | RegExp | ((origin: string) => boolean),
		options: InterceptOptions,
	): Promise<string | null | undefined> {
		if (!pending.persist && pending.timesInvoked >= pending.times) return;
		if (!this.matchOriginAndPath(request, origin, options.path)) return;
		if (request.method !== pending.method) return;
		if (!matchQuery(request, options.query)) return;
		if (!matchHeaders(request, options.headers)) return;

		// Claim this interceptor synchronously before any async work
		// to prevent parallel requests from matching the same handler.
		pending.timesInvoked++;

		const bodyText = await readBody();
		if (!matchBody(bodyText, options.body)) {
			pending.timesInvoked--; // rollback: body didn't match after all
			return;
		}

		if (this._callHistoryEnabled) {
			recordCall(this._calls, request, bodyText);
		}
		return bodyText;
	}

	private registerHandler(pending: PendingInterceptor, handlerFn: MatchingHandler): void {
		this.handlerFns.set(pending, handlerFn);
		this.ensureCatchAllInstalled();
	}

	private createMatchingHandler(
		pending: PendingInterceptor,
		origin: string | RegExp | ((origin: string) => boolean),
		options: InterceptOptions,
		delayRef: { ms: number },
		respond: (bodyText: string | null) => Promise<Response>,
	): MatchingHandler {
		return async (request, readBody) => {
			const bodyText = await this.matchAndConsume(request, readBody, pending, origin, options);
			if (bodyText === undefined) return;

			if (delayRef.ms > 0) {
				await new Promise<void>((resolve) => {
					const timer = setTimeout(resolve, delayRef.ms);
					const onAbort = () => {
						clearTimeout(timer);
						resolve();
					};
					if (request.signal?.aborted) {
						onAbort();
					} else {
						request.signal?.addEventListener('abort', onAbort, { once: true });
					}
				});
			}

			return respond(bodyText);
		};
	}

	private buildChain(
		pending: PendingInterceptor,
		delayRef: { ms: number },
		contentLengthRef: { enabled: boolean } | undefined,
		pool: MockPool,
	): MockReplyChain {
		const chain: MockReplyChain = {
			times(n: number) {
				pending.times = n;
				return chain;
			},
			persist() {
				pending.persist = true;
				return chain;
			},
			delay(ms: number) {
				delayRef.ms = ms;
				return chain;
			},
			replyContentLength() {
				if (contentLengthRef) contentLengthRef.enabled = true;
				return chain;
			},
			intercept(options: InterceptOptions): MockInterceptor {
				return pool.intercept(options);
			},
		};
		return chain;
	}

	get(origin: string | RegExp | ((origin: string) => boolean)): MockPool {
		const originStr = describeMatcher(origin);

		const pool: MockPool = {
			intercept: (options: InterceptOptions): MockInterceptor => {
				// Validate: cannot use both path query string and query parameter
				if (typeof options.path === 'string' && options.path.includes('?') && options.query) {
					throw new Error(
						'Cannot use both query string in path and query parameter. Use either path: "/api?limit=10" or path: "/api", query: { limit: "10" }',
					);
				}

				const pending: PendingInterceptor = {
					origin: originStr,
					path: describeMatcher(options.path),
					method: options.method ?? 'GET',
					consumed: false,
					times: 1,
					timesInvoked: 0,
					persist: false,
				};
				return {
					reply: (
						statusOrCallback: number | SingleReplyCallback,
						bodyOrCallback?: unknown | ReplyCallback,
						replyOptions?: ReplyOptions,
					): MockReplyChain => {
						const delayRef = { ms: 0 };
						const contentLengthRef = { enabled: false };

						const respond = async (bodyText: string | null): Promise<Response> => {
							if (typeof statusOrCallback === 'function') {
								const result = await statusOrCallback({ body: bodyText });
								return this.buildResponse(
									result.statusCode,
									result.data,
									result.responseOptions,
									this._defaultReplyHeaders,
									contentLengthRef.enabled,
								);
							}

							const responseBody =
								typeof bodyOrCallback === 'function'
									? await (bodyOrCallback as ReplyCallback)({ body: bodyText })
									: bodyOrCallback;

							return this.buildResponse(
								statusOrCallback,
								responseBody,
								replyOptions,
								this._defaultReplyHeaders,
								contentLengthRef.enabled,
							);
						};

						this.registerHandler(
							pending,
							this.createMatchingHandler(pending, origin, options, delayRef, respond),
						);

						return this.buildChain(pending, delayRef, contentLengthRef, pool);
					},

					replyWithError: (): MockReplyChain => {
						const delayRef = { ms: 0 };

						this.registerHandler(
							pending,
							this.createMatchingHandler(pending, origin, options, delayRef, async () => {
								return this.handlerFactory.buildErrorResponse();
							}),
						);

						return this.buildChain(pending, delayRef, undefined, pool);
					},
				};
			},
		};

		return pool;
	}
}
