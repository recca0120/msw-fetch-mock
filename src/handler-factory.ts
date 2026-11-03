import { HttpResponse, http } from 'msw';
import { type HandlerFactory as HandlerFactoryType } from './types';

export const HandlerFactory: HandlerFactoryType = {
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
