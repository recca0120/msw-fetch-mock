export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type PathMatcher = string | RegExp | ((path: string) => boolean);
export type HeaderValueMatcher = string | RegExp | ((value: string) => boolean);
export type BodyMatcher = string | RegExp | ((body: string) => boolean);

export interface InterceptOptions {
	path: PathMatcher;
	method?: HttpMethod;
	headers?: Record<string, HeaderValueMatcher>;
	body?: BodyMatcher;
	query?: Record<string, string>;
}

export interface ReplyOptions {
	headers?: Record<string, string>;
}

export type ReplyCallback = (req: { body: string | null }) => unknown | Promise<unknown>;

export interface SingleReplyResult {
	statusCode: number;
	data: unknown;
	responseOptions?: ReplyOptions;
}

export type SingleReplyCallback = (req: {
	body: string | null;
}) => SingleReplyResult | Promise<SingleReplyResult>;

export interface MockReplyChain {
	times(n: number): void;
	persist(): void;
	delay(ms: number): void;
	replyContentLength(): void;
	intercept(options: InterceptOptions): MockInterceptor;
}

export interface MockInterceptor {
	reply(status: number, body?: unknown, options?: ReplyOptions): MockReplyChain;
	reply(status: number, callback: ReplyCallback): MockReplyChain;
	reply(callback: SingleReplyCallback): MockReplyChain;
	replyWithError(error?: Error): MockReplyChain;
}

export interface MockPool {
	intercept(options: InterceptOptions): MockInterceptor;
}

export interface PendingInterceptor {
	origin: string;
	path: string;
	method: string;
	consumed: boolean;
	times: number;
	timesInvoked: number;
	persist: boolean;
}

export type NetConnectMatcher = true | false | string | RegExp | ((host: string) => boolean);

export type PrintAPI = { warning(): void; error(): void };
export type OnUnhandledRequestCallback = (request: Request, print: PrintAPI) => void;
export type OnUnhandledRequest = 'bypass' | 'warn' | 'error' | OnUnhandledRequestCallback;

export interface ActivateOptions {
	onUnhandledRequest?: OnUnhandledRequest;
	/**
	 * Timeout in milliseconds for each fetch request.
	 * Helps prevent hanging on platforms with known issues (e.g., macOS + Node 23).
	 * Set to 0 to disable. Default: 30000 (30 seconds).
	 */
	timeout?: number;
	/**
	 * Force 'Connection: close' header on all requests to disable keep-alive.
	 * Workaround for Undici connection pooling issues on macOS.
	 * Default: false.
	 */
	forceConnectionClose?: boolean;
}

export interface ResolvedActivateOptions {
	onUnhandledRequest: OnUnhandledRequestCallback;
	timeout: number;
	forceConnectionClose: boolean;
}

/** Structural type to avoid cross-package nominal type mismatch on MSW's private fields */
export interface SetupServerLike {
	use(...handlers: Array<unknown>): void;
	resetHandlers(...handlers: Array<unknown>): void;
	listen(options?: Record<string, unknown>): void;
	close(): void;
}

/** Structural type for MSW's setupWorker return type */
export interface SetupWorkerLike {
	use(...handlers: Array<unknown>): void;
	resetHandlers(...handlers: Array<unknown>): void;
	start(options?: Record<string, unknown>): Promise<void>;
	stop(): void;
}

/** Environment-agnostic adapter interface for MSW server/worker */
export interface MswAdapter {
	use(...handlers: Array<unknown>): void;
	resetHandlers(...handlers: Array<unknown>): void;
	activate(options: ResolvedActivateOptions): void | Promise<void>;
	deactivate(): void;
}

/** Pluggable factory for MSW-version-specific handler and response creation */
export interface HandlerFactory {
	createHandler(
		method: HttpMethod,
		urlPattern: string | RegExp,
		handlerFn: (request: Request) => Promise<Response | undefined>,
	): unknown;
	createCatchAllHandler(handlerFn: (request: Request) => Promise<Response | undefined>): unknown;
	buildResponse(status: number, body: unknown, headers?: Headers): Response;
	buildErrorResponse(): Response;
}
