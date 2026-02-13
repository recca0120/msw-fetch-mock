import { type NativeHandler } from './native-handler-factory';
import { type MswAdapter, type ResolvedActivateOptions } from './types';

export class NativeFetchAdapter implements MswAdapter {
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
		init?: RequestInit
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
				console.warn(
					`[msw-fetch-mock] Warning: intercepted a request without a matching request handler:\n\n` +
						`  \u2022 ${request.method} ${request.url}\n\n` +
						`If you still wish to intercept this unhandled request, please create a request handler for it.`
				);
			},
			error: () => {
				throw new TypeError(
					`[msw-fetch-mock] Cannot bypass a request when using the "error" strategy for the "onUnhandledRequest" option.\n\n` +
						`  \u2022 ${request.method} ${request.url}\n`
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

	private async withTimeout<T>(fn: () => Promise<T>, userSignal?: AbortSignal | null): Promise<T> {
		const timeout = this.options.timeout;

		// If no timeout or user provided their own signal, run without timeout wrapper
		if (timeout <= 0 || userSignal) {
			return fn();
		}

		// Race between the operation and a timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const timeoutPromise = new Promise<never>((_, reject) => {
				controller.signal.addEventListener('abort', () => {
					reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
				});
			});

			return await Promise.race([fn(), timeoutPromise]);
		} finally {
			clearTimeout(timeoutId);
		}
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
