import { type HandlerFactory } from './types';

/** The native interceptor runs every handler for every request. */
export interface NativeHandler {
  handlerFn: (request: Request) => Promise<Response | undefined>;
}

export const NativeHandlerFactory: HandlerFactory = {
  createCatchAllHandler(handlerFn): NativeHandler {
    return { handlerFn };
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
