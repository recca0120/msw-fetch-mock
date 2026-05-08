import { formatUnhandledRequestWarning } from './messages';
import { type NativeHandler } from './native-handler-factory';
import { type FetchInterceptor, type ResolvedActivateOptions } from './types';

export class NativeFetchInterceptor implements FetchInterceptor {
	private originalFetch!: typeof globalThis.fetch;
	private handlers: NativeHandler[] = [];
	private options!: ResolvedActivateOptions;

	activate(options: ResolvedActivateOptions): void {
		this.options = options;
		this.originalFetch = globalThis.fetch;
		globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			// Apply forceConnectionClose if enabled
			const modifiedInit = this.applyConnectionClose(init);

			// Create request
			const request = new Request(input, modifiedInit);

			// Wrap execution with timeout if configured
			return this.withTimeout(() => this.handleRequest(request, input, modifiedInit), init?.signal);
		};
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

		this.options.onUnhandledRequest(request, {
			warning: () => {
				console.warn(formatUnhandledRequestWarning(request.method, request.url));
			},
			error: () => {
				throw new TypeError(
					`[msw-fetch-mock] Cannot bypass a request when using the "error" strategy for the "onUnhandledRequest" option.\n\n` +
						`  \u2022 ${request.method} ${request.url}\n`,
				);
			},
		});

		return this.originalFetch(input, init);
	}

	private applyConnectionClose(init?: RequestInit): RequestInit | undefined {
		if (!this.options.forceConnectionClose) {
			return init;
		}
		const headers = new Headers(init?.headers);
		headers.set('Connection', 'close');
		return { ...init, headers };
	}

	private withTimeout<T>(fn: () => Promise<T>, userSignal?: AbortSignal | null): Promise<T> {
		const timeout = this.options.timeout;
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
}
