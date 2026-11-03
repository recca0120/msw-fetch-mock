import { HttpResponse, http } from 'msw';
import { type HandlerFactory as HandlerFactoryType, type HttpMethod } from './types';

const methods: Record<HttpMethod, typeof http.get> = {
	GET: http.get,
	POST: http.post,
	PUT: http.put,
	DELETE: http.delete,
	PATCH: http.patch,
};

export const HandlerFactory: HandlerFactoryType = {
	createHandler(method, urlPattern, handlerFn) {
		return methods[method](urlPattern, async ({ request }) => handlerFn(request));
	},

	createCatchAllHandler(handlerFn) {
		return http.all('*', async ({ request }) => handlerFn(request));
	},

	buildResponse(status, body, headers) {
		// No body, a string or a stream is sent as-is; anything else as JSON.
		if (
			body === null ||
			body === undefined ||
			typeof body === 'string' ||
			body instanceof ReadableStream
		) {
			return new HttpResponse(body ?? null, { status, headers });
		}
		return HttpResponse.json(body, { status, headers });
	},

	buildErrorResponse() {
		return HttpResponse.error();
	},
};
