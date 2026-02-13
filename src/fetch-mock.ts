import {
	isPending,
	matchBody,
	matchesValue,
	matchHeaders,
	matchPath,
	matchQuery,
	recordCall,
} from './matchers';
import { MockCallHistory } from './mock-call-history';
import { isMswAdapter, isSetupServerLike, isSetupWorkerLike } from './type-guards';
import {
	type ActivateOptions,
	type HandlerFactory,
	type InterceptOptions,
	type MockInterceptor,
	type MockPool,
	type MockReplyChain,
	type MswAdapter,
	type NetConnectMatcher,
	type PendingInterceptor,
	type ReplyCallback,
	type ReplyOptions,
	type ResolvedActivateOptions,
	type SetupServerLike,
	type SetupWorkerLike,
	type SingleReplyCallback,
} from './types';

export type {
	ActivateOptions,
	InterceptOptions,
	MockInterceptor,
	MockPool,
	MockReplyChain,
	OnUnhandledRequest,
	PendingInterceptor,
	ReplyOptions,
} from './types';

/**
 * Thin wrapper: adapts a user-provided `setupServer` instance to {@link MswAdapter}.
 *
 * **Difference from {@link NodeMswAdapter}:**
 * - `createServerAdapter` does NOT own the server lifecycle — the caller is
 *   responsible for `listen()` / `close()`.
 * - `NodeMswAdapter` creates and manages its own `setupServer` internally
 *   (calls `listen()` on activate and `close()` on deactivate).
 *
 * Both exist intentionally: `NodeMswAdapter` is used by `createFetchMock()`
 * for standalone usage, while `createServerAdapter` supports the
 * `new FetchMock(existingServer)` pattern where the user already has an MSW
 * server running.
 */
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

/**
 * Thin wrapper: adapts a user-provided setupWorker instance to MswAdapter.
 * Unlike BrowserMswAdapter, this does NOT manage the worker lifecycle —
 * the caller owns start/stop.
 */
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
	private handlerFns: Map<PendingInterceptor, (request: Request) => Promise<Response | undefined>> =
		new Map();
	private _defaultReplyHeaders: Record<string, string> = {};
	private _callHistoryEnabled = true;
	private catchAllInstalled = false;
	private _onUnhandledRequest?: (
		request: Request,
		print: { warning(): void; error(): void }
	) => void;

	get calls(): MockCallHistory {
		return this._calls;
	}

	constructor(input?: SetupServerLike | SetupWorkerLike | MswAdapter) {
		this.adapter = resolveAdapter(input);
	}

	async activate(options?: ActivateOptions): Promise<void> {
		const mode = options?.onUnhandledRequest ?? 'error';
		const timeout = options?.timeout ?? 30000; // Default 30 seconds
		const forceConnectionClose = options?.forceConnectionClose ?? false;

		this._onUnhandledRequest = (request: Request, print: { warning(): void; error(): void }) => {
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

		await this.adapter.activate({
			onUnhandledRequest: this._onUnhandledRequest,
			timeout,
			forceConnectionClose,
		});

		// Install the catch-all handler eagerly so that it is ready before
		// the first fetch.  In browser environments `worker.use()` must finish
		// before the Service Worker can match requests — doing it once here
		// (behind the already-awaited `activate`) avoids per-test race conditions.
		this.catchAllInstalled = false;
		this.ensureCatchAllInstalled();
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
	 * Installs a single catch-all MSW handler that dispatches requests to
	 * registered interceptors in FIFO order. All matching logic runs in the
	 * main thread, eliminating race conditions with Service Worker messaging.
	 *
	 * The catch-all is installed once and stays active until reset/deactivate.
	 * Adding or consuming interceptors only mutates in-memory data structures,
	 * so no additional adapter.use() calls are needed.
	 */
	private ensureCatchAllInstalled(): void {
		if (this.catchAllInstalled) return;

		const catchAllHandler = this.handlerFactory.createCatchAllHandler(async (request: Request) => {
			// Iterate handlers in FIFO order (insertion order of Map)
			for (const [pending, handlerFn] of this.handlerFns) {
				if (pending.consumed && !pending.persist) continue;

				// Clone request so each handler can read the body independently
				const response = await handlerFn(request.clone());
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
						console.warn(
							`[msw-fetch-mock] Warning: intercepted a request without a matching request handler:\n\n` +
								`  \u2022 ${request.method} ${request.url}\n\n` +
								`If you still wish to intercept this unhandled request, please create a request handler for it.`
						);
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

		this.adapter.resetHandlers();
		this.adapter.use(catchAllHandler);
		this.catchAllInstalled = true;
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
		this.interceptors = [];
		this.handlerFns.clear();
		this._calls.clear();
		this.catchAllInstalled = false;
		this.adapter.deactivate();
	}

	reset(): void {
		this.interceptors = [];
		this.handlerFns.clear();
		this._calls.clear();
		this._defaultReplyHeaders = {};
		// The catch-all handler is intentionally kept installed so that no
		// additional adapter.use() / worker.use() calls are needed between
		// tests.  Because the catch-all reads `this.handlerFns` (now cleared),
		// it will correctly fall through to `_onUnhandledRequest`.
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

	private matchOriginAndPath(
		request: Request,
		origin: string | RegExp | ((origin: string) => boolean),
		originStr: string,
		path: InterceptOptions['path']
	): boolean {
		if (typeof origin === 'string') {
			// String origin: URL pattern already filtered by origin prefix,
			// just match the path portion.
			return matchPath(request, originStr, path);
		}

		// Non-string origin: URL pattern is catch-all (/.*/),
		// so we must manually match both origin and path.
		const url = new URL(request.url);

		if (origin instanceof RegExp ? !origin.test(url.origin) : !origin(url.origin)) {
			return false;
		}

		if (typeof path === 'string') {
			return url.pathname === path || url.pathname.endsWith(path);
		}

		const fullPath = url.pathname + url.search;
		return matchesValue(fullPath, path as RegExp | ((v: string) => boolean));
	}

	private async matchAndConsume(
		request: Request,
		pending: PendingInterceptor,
		origin: string | RegExp | ((origin: string) => boolean),
		originStr: string,
		options: InterceptOptions
	): Promise<string | null | undefined> {
		if (!pending.persist && pending.timesInvoked >= pending.times) return;
		if (!this.matchOriginAndPath(request, origin, originStr, options.path)) return;
		// Check method match
		const expectedMethod = options.method ?? 'GET';
		if (request.method !== expectedMethod) return;
		if (!matchQuery(request, options.query)) return;
		if (!matchHeaders(request, options.headers)) return;

		const bodyText = (await request.text()) || null;
		if (!matchBody(bodyText, options.body)) return;

		pending.timesInvoked++;
		if (!pending.persist && pending.timesInvoked >= pending.times) {
			pending.consumed = true;
		}

		if (this._callHistoryEnabled) {
			recordCall(this._calls, request, bodyText);
		}
		return bodyText;
	}

	private registerHandler(
		pending: PendingInterceptor,
		handlerFn: (request: Request) => Promise<Response | undefined>
	): void {
		this.handlerFns.set(pending, handlerFn);
		this.ensureCatchAllInstalled();
	}

	private createMatchingHandler(
		pending: PendingInterceptor,
		origin: string | RegExp | ((origin: string) => boolean),
		originStr: string,
		options: InterceptOptions,
		delayRef: { ms: number },
		respond: (bodyText: string | null) => Promise<Response>
	): (request: Request) => Promise<Response | undefined> {
		return async (request: Request) => {
			const bodyText = await this.matchAndConsume(request, pending, origin, originStr, options);
			if (bodyText === undefined) return;

			if (delayRef.ms > 0) {
				await new Promise((resolve) => setTimeout(resolve, delayRef.ms));
			}

			return respond(bodyText);
		};
	}

	private buildChain(
		pending: PendingInterceptor,
		delayRef: { ms: number },
		contentLengthRef: { enabled: boolean },
		pool: MockPool
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
			intercept(options: InterceptOptions): MockInterceptor {
				return pool.intercept(options);
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

		const pool: MockPool = {
			intercept: (options: InterceptOptions): MockInterceptor => {
				// Validate: cannot use both path query string and query parameter
				if (typeof options.path === 'string' && options.path.includes('?') && options.query) {
					throw new Error(
						'Cannot use both query string in path and query parameter. Use either path: "/api?limit=10" or path: "/api", query: { limit: "10" }'
					);
				}

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

				return {
					reply: (
						statusOrCallback: number | SingleReplyCallback,
						bodyOrCallback?: unknown | ReplyCallback,
						replyOptions?: ReplyOptions
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
									contentLengthRef.enabled
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
								contentLengthRef.enabled
							);
						};

						this.registerHandler(
							pending,
							this.createMatchingHandler(pending, origin, originStr, options, delayRef, respond)
						);

						return this.buildChain(pending, delayRef, contentLengthRef, pool);
					},

					replyWithError: (): MockReplyChain => {
						const delayRef = { ms: 0 };
						const contentLengthRef = { enabled: false };

						this.registerHandler(
							pending,
							this.createMatchingHandler(
								pending,
								origin,
								originStr,
								options,
								delayRef,
								async () => {
									return this.handlerFactory.buildErrorResponse();
								}
							)
						);

						return this.buildChain(pending, delayRef, contentLengthRef, pool);
					},
				};
			},
		};

		return pool;
	}
}
