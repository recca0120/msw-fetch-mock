import { type HandlerFactory, type HttpMethod } from './types';

export interface NativeHandler {
	method: HttpMethod;
	urlPattern: string | RegExp;
	handlerFn: (request: Request) => Promise<Response | undefined>;
}

export const NativeHandlerFactory: HandlerFactory = {
	/**
	 * @deprecated Never called by FetchMock, and the native interceptor ignores the
	 * handler's method and URL pattern. Will be removed in 0.7.0.
	 */
	createHandler(method, urlPattern, handlerFn): NativeHandler {
		return { method, urlPattern, handlerFn };
	},

	createCatchAllHandler(handlerFn): NativeHandler {
		// For native interceptor, catch-all uses '*' pattern and matches all methods
		return { method: 'GET', urlPattern: '*', handlerFn };
	},

	buildResponse(status, body, headers) {
		// No body, a string or a stream is sent as-is; anything else as JSON.
		if (
			body === null ||
			body === undefined ||
			typeof body === 'string' ||
			body instanceof ReadableStream
		) {
			return new Response(body ?? null, { status, headers });
		}
		return Response.json(body, { status, headers });
	},

	buildErrorResponse() {
		return Response.error();
	},
};
