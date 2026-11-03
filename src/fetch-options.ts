import { type ResolvedActivateOptions } from './types';

type FetchOptions = Pick<ResolvedActivateOptions, 'timeout' | 'forceConnectionClose'>;

/**
 * Returns `init` with a `Connection: close` header added. Follows fetch's own header
 * precedence: `init.headers` replaces the headers of a `Request` input, so the input's
 * headers are only used when `init` has none.
 */
export function withConnectionClose(input: RequestInfo | URL, init?: RequestInit): RequestInit {
	const headers = new Headers(
		init?.headers ?? (input instanceof Request ? input.headers : undefined),
	);
	headers.set('Connection', 'close');
	return { ...init, headers };
}

/**
 * Rejects with a `TimeoutError` if `fn` has not settled within `timeout` ms.
 * Disabled when `timeout <= 0` or when the caller passed their own abort signal.
 */
export function withTimeout<T>(
	fn: () => Promise<T>,
	timeout: number,
	userSignal?: AbortSignal | null,
): Promise<T> {
	if (timeout <= 0 || userSignal) return fn();

	let timeoutId: ReturnType<typeof setTimeout>;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(
			() => reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
			timeout,
		);
	});

	return Promise.race([fn(), timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/** Our fetch wrappers → the fetch each one wraps (see unwrapFetch). */
const wrappedFetches = new WeakMap<typeof globalThis.fetch, typeof globalThis.fetch>();

/** Strips any fetch-options wrappers installed by this module, e.g. to inspect MSW's patch. */
export function unwrapFetch(fetchFn: typeof globalThis.fetch): typeof globalThis.fetch {
	let current = fetchFn;
	for (let inner = wrappedFetches.get(current); inner; inner = wrappedFetches.get(current)) {
		current = inner;
	}
	return current;
}

/**
 * Applies `timeout` and `forceConnectionClose` to every `fetch()` call by wrapping
 * the current `globalThis.fetch` (e.g. the one MSW installed on `listen()`).
 * Returns a function that removes the wrapper. Installs nothing when both are disabled.
 */
export function installFetchOptions(options: FetchOptions): () => void {
	const { timeout, forceConnectionClose } = options;
	if (timeout <= 0 && !forceConnectionClose) return () => {};

	const wrappedFetch = globalThis.fetch;
	const fetchWithOptions: typeof globalThis.fetch = function fetchWithOptions(input, init) {
		const nextInit = forceConnectionClose ? withConnectionClose(input, init) : init;
		return withTimeout(() => wrappedFetch(input, nextInit), timeout, init?.signal);
	};
	wrappedFetches.set(fetchWithOptions, wrappedFetch);
	globalThis.fetch = fetchWithOptions;

	return () => {
		// Only unwrap if nothing replaced fetch since; otherwise we would drop that patch.
		if (globalThis.fetch === fetchWithOptions) globalThis.fetch = wrappedFetch;
	};
}
