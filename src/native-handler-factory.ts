import type { HandlerFactory, HttpMethod } from './types';

export interface NativeHandler {
  method: HttpMethod;
  urlPattern: string | RegExp;
  handlerFn: (request: Request) => Promise<Response | undefined>;
}

export const NativeHandlerFactory: HandlerFactory = {
  createHandler(method, urlPattern, handlerFn): NativeHandler {
    return { method, urlPattern, handlerFn };
  },

  createCatchAllHandler(handlerFn): NativeHandler {
    // For native adapter, catch-all uses '*' pattern and matches all methods
    return { method: 'GET', urlPattern: '*', handlerFn };
  },

  buildResponse(status, body, headers) {
    if (body === null || body === undefined) {
      return new Response(null, { status, headers });
    }
    return Response.json(body, { status, headers });
  },

  buildErrorResponse() {
    return Response.error();
  },
};
