import { withConnectionClose, withTimeout } from './fetch-options';
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
			const modifiedInit = this.options.forceConnectionClose
				? withConnectionClose(input, init)
				: init;
			const request = new Request(input, modifiedInit);

			return withTimeout(
				() => this.handleRequest(request, input, modifiedInit),
				this.options.timeout,
				init?.signal,
			);
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

	listHandlers(): ReadonlyArray<unknown> {
		return this.handlers;
	}
}
