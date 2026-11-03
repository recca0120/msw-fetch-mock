import { InterceptorRegistry } from './interceptor-registry';
import { matchesValue, urlOf } from './matchers';
import { formatUnhandledRequestWarning } from './messages';
import { MockCallHistory, recordCall } from './mock-call-history';
import { resolveInterceptor } from './resolve-interceptor';
import {
	type ActivateOptions,
	type FetchInterceptor,
	type HandlerFactory,
	type MockPool,
	type NetConnectMatcher,
	type OnUnhandledRequestCallback,
	type PendingInterceptor,
	type ReplyOptions,
	type SetupServerLike,
	type SetupWorkerLike,
} from './types';

/**
 * UTF-8 byte length of a reply body as it is sent: strings as-is, other values as JSON.
 * Returns undefined when there is no body or its length is unknown (a stream).
 */
function byteLengthOf(body: unknown): number | undefined {
	if (body === null || body === undefined || body instanceof ReadableStream) return undefined;
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	return new TextEncoder().encode(text).byteLength;
}

/**
 * Public fetch-mock API. Owns the interceptor lifecycle (activate / deactivate,
 * the catch-all handler), unhandled-request and net-connect policy, call history
 * and default reply headers; matching is delegated to {@link InterceptorRegistry}.
 */
export class FetchMock {
	/** @internal */
	static _defaultInterceptorFactory?: () => FetchInterceptor;
	/** @internal */
	static _handlerFactory?: HandlerFactory;

	private readonly _instanceHandlerFactory?: HandlerFactory;
	private readonly _calls = new MockCallHistory();
	private readonly interceptor: FetchInterceptor;
	private readonly registry: InterceptorRegistry;
	private netConnectAllowed: NetConnectMatcher = false;
	private _defaultReplyHeaders: Record<string, string> = {};
	private _callHistoryEnabled = true;
	/** The installed catch-all handler; undefined until (re)installed by activate(). */
	private catchAllHandler: unknown;
	private _onUnhandledRequest?: OnUnhandledRequestCallback;

	constructor(
		input?: SetupServerLike | SetupWorkerLike | FetchInterceptor,
		handlerFactory?: HandlerFactory,
	) {
		this.interceptor = resolveInterceptor(input, FetchMock._defaultInterceptorFactory);
		this._instanceHandlerFactory = handlerFactory;
		this.registry = new InterceptorRegistry({
			buildResponse: (status, body, replyOptions, addContentLength) =>
				this.buildResponse(status, body, replyOptions, addContentLength),
			buildErrorResponse: () => this.handlerFactory.buildErrorResponse(),
			recordCall: (request, bodyText) => {
				if (this._callHistoryEnabled) recordCall(this._calls, request, bodyText);
			},
			onRegister: () => this.ensureCatchAllInstalled(),
		});
	}

	get calls(): MockCallHistory {
		return this._calls;
	}

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
		replyOptions: ReplyOptions | undefined,
		addContentLength: boolean,
	): Response {
		const mergedHeaders: Record<string, string> = { ...this._defaultReplyHeaders };
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
		return matchesValue(urlOf(request).host, allowed);
	}

	/**
	 * Creates the single catch-all handler that dispatches requests to the
	 * registered interceptors (FIFO). All matching logic runs in the main thread,
	 * eliminating race conditions with Service Worker messaging.
	 *
	 * The catch-all is installed once and stays active until reset/deactivate.
	 * Adding or consuming interceptors only mutates in-memory data structures,
	 * so no additional interceptor.use() calls are needed.
	 */
	private createCatchAllHandler(): unknown {
		return this.handlerFactory.createCatchAllHandler(async (request: Request) => {
			const response = await this.registry.dispatch(request);
			if (response !== undefined) return response;

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

	/**
	 * Stops intercepting. Cleanup happens synchronously; the returned Promise settles
	 * once the interceptor has fully stopped (MSW v3's `worker.stop()` is async).
	 */
	async deactivate(): Promise<void> {
		this.registry.clear();
		this._calls.clear();
		this.catchAllHandler = undefined;
		await this.interceptor.deactivate();
	}

	reset(): void {
		this.registry.clear();
		this._calls.clear();
		this._defaultReplyHeaders = {};
		// The catch-all handler is intentionally kept installed so that no
		// additional interceptor.use() / worker.use() calls are needed between
		// tests.  Because the catch-all dispatches to the (now empty) registry,
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
		return this.registry.pending();
	}

	get(origin: string | RegExp | ((origin: string) => boolean)): MockPool {
		return this.registry.get(origin);
	}
}
