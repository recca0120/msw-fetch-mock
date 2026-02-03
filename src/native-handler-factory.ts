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
