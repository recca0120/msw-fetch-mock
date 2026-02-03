import { http, HttpResponse } from 'msw';
import type { HttpMethod, HandlerFactory } from './types';

const methods: Record<HttpMethod, typeof http.get> = {
  GET: http.get,
  POST: http.post,
  PUT: http.put,
  DELETE: http.delete,
  PATCH: http.patch,
};

export const v2HandlerFactory: HandlerFactory = {
  createHandler(method, urlPattern, handlerFn) {
    return methods[method](urlPattern, async ({ request }) => handlerFn(request));
  },

  buildResponse(status, body, headers) {
    if (body === null || body === undefined) {
      return new HttpResponse(null, { status, headers });
    }
    return HttpResponse.json(body, { status, headers });
  },

  buildErrorResponse() {
    return HttpResponse.error();
  },
};
