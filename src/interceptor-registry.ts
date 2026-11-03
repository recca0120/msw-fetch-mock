import {
	describeMatcher,
	isPending,
	matchBody,
	matchesValue,
	matchHeaders,
	matchPath,
	matchQuery,
	urlOf,
} from './matchers';
import {
	type InterceptOptions,
	type MockInterceptor,
	type MockPool,
	type MockReplyChain,
	type PendingInterceptor,
	type ReplyCallback,
	type ReplyOptions,
	type SingleReplyCallback,
	type StringMatcher,
} from './types';

type OriginMatcher = StringMatcher;

/**
 * Tries to answer a request for one interceptor; resolves undefined when it does not match.
 * `readBody` reads the request body once per request, shared by all interceptors.
 */
type MatchingHandler = (
	request: Request,
	readBody: () => Promise<string | null>,
) => Promise<Response | undefined>;

/** What the registry needs from its owner (FetchMock) to build responses and record calls. */
export interface InterceptorRegistryHost {
	buildResponse(
		status: number,
		body: unknown,
		replyOptions: ReplyOptions | undefined,
		addContentLength: boolean,
	): Response;
	buildErrorResponse(): Response;
	/** Called for every request an interceptor matched (body included). */
	recordCall(request: Request, bodyText: string | null): void;
	/** Called after an interceptor is registered (e.g. to make sure the catch-all is installed). */
	onRegister(): void;
}

/**
 * The matching engine: registered interceptors, the
 * `get(origin).intercept(options).reply(...)` builder, and request dispatch.
 * Interceptors are tried in registration (FIFO) order.
 */
export class InterceptorRegistry {
	private readonly host: InterceptorRegistryHost;
	private readonly handlers = new Map<PendingInterceptor, MatchingHandler>();

	constructor(host: InterceptorRegistryHost) {
		this.host = host;
	}

	/** Answers `request` with the first matching interceptor, or resolves undefined. */
	async dispatch(request: Request): Promise<Response | undefined> {
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

		for (const handler of this.handlers.values()) {
			const response = await handler(request, readBody);
			if (response !== undefined) return response;
		}
		return undefined;
	}

	clear(): void {
		this.handlers.clear();
	}

	pending(): PendingInterceptor[] {
		return [...this.handlers.keys()].filter(isPending).map((p) => ({ ...p }));
	}

	get(origin: OriginMatcher): MockPool {
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

				// Registers how to respond and returns the chain to configure it.
				const register = (
					respond: (bodyText: string | null) => Promise<Response>,
					contentLengthRef?: { enabled: boolean },
				): MockReplyChain => {
					const delayRef = { ms: 0 };
					this.handlers.set(
						pending,
						this.createMatchingHandler(pending, origin, options, delayRef, respond),
					);
					this.host.onRegister();
					return this.buildChain(pending, delayRef, contentLengthRef, pool);
				};

				return {
					reply: (
						statusOrCallback: number | SingleReplyCallback,
						bodyOrCallback?: unknown | ReplyCallback,
						replyOptions?: ReplyOptions,
					): MockReplyChain => {
						const contentLengthRef = { enabled: false };
						return register(async (bodyText) => {
							const { statusCode, data, responseOptions } =
								typeof statusOrCallback === 'function'
									? await statusOrCallback({ body: bodyText })
									: {
											statusCode: statusOrCallback,
											data:
												typeof bodyOrCallback === 'function'
													? await (bodyOrCallback as ReplyCallback)({ body: bodyText })
													: bodyOrCallback,
											responseOptions: replyOptions,
										};
							return this.host.buildResponse(
								statusCode,
								data,
								responseOptions,
								contentLengthRef.enabled,
							);
						}, contentLengthRef);
					},

					replyWithError: (): MockReplyChain =>
						register(async () => this.host.buildErrorResponse()),
				};
			},
		};

		return pool;
	}

	private createMatchingHandler(
		pending: PendingInterceptor,
		origin: OriginMatcher,
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

	private async matchAndConsume(
		request: Request,
		readBody: () => Promise<string | null>,
		pending: PendingInterceptor,
		origin: OriginMatcher,
		options: InterceptOptions,
	): Promise<string | null | undefined> {
		if (!pending.persist && pending.timesInvoked >= pending.times) return;
		if (!matchOriginAndPath(request, origin, options.path)) return;
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

		this.host.recordCall(request, bodyText);
		return bodyText;
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
}

function matchOriginAndPath(
	request: Request,
	origin: OriginMatcher,
	path: InterceptOptions['path'],
): boolean {
	if (typeof origin === 'string') {
		// String origin: matchPath checks the origin prefix and the path below it.
		return matchPath(request, origin, path);
	}

	// RegExp / function origin: match the origin, then the path on its own.
	const url = urlOf(request);
	if (!matchesValue(url.origin, origin)) return false;

	if (typeof path === 'string') {
		return url.pathname === path || url.pathname.endsWith(path);
	}

	return matchesValue(url.pathname + url.search, path);
}
