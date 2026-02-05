import type { HttpMethod, HandlerFactory } from './types';

/** Duck-typed interface for MSW v1's `rest` API methods */
export type LegacyRestMethod = (
  url: string | RegExp,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolver: (req: any, res: any, ctx: any) => any
) => unknown;

/** Duck-typed interface for MSW v1's `rest` namespace */
export type LegacyRestApi = Record<Lowercase<HttpMethod> | 'all', LegacyRestMethod>;

/** Convert MSW v1 request object to standard Request */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertV1Request(req: any): Request {
  const headers = new Headers(req.headers.all());
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body =
    hasBody && req.body != null
      ? typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body)
      : undefined;

  return new Request(req.url.toString(), {
    method: req.method,
    headers,
    body,
  });
}

/** Convert standard Response to MSW v1 res(ctx...) format */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function convertToV1Response(response: Response, res: any, ctx: any): Promise<any> {
  if (response.type === 'error') {
    return res.networkError('Failed to fetch');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformers: any[] = [ctx.status(response.status)];

  response.headers.forEach((value: string, key: string) => {
    transformers.push(ctx.set(key, value));
  });

  const text = await response.text();
  if (text) {
    transformers.push(ctx.body(text));
  }

  return res(...transformers);
}

/**
 * Creates a HandlerFactory for MSW v1 (legacy) API.
 *
 * MSW v1 uses `rest.get(url, (req, res, ctx) => res(ctx.json(data)))` style.
 * This factory bridges the standard Request/Response interface used by FetchMock
 * to the v1 resolver callback format.
 *
 * @param rest - The `rest` object from `msw` v1 (e.g., `import { rest } from 'msw'`)
 */
export function createLegacyHandlerFactory(rest: LegacyRestApi): HandlerFactory {
  const methods: Record<HttpMethod, LegacyRestMethod> = {
    GET: rest.get,
    POST: rest.post,
    PUT: rest.put,
    DELETE: rest.delete,
    PATCH: rest.patch,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createResolver = (handlerFn: (request: Request) => Promise<Response | undefined>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (req: any, res: any, ctx: any) => {
      const request = convertV1Request(req);
      const response = await handlerFn(request);
      if (!response) return undefined; // passthrough
      return convertToV1Response(response, res, ctx);
    };
  };

  return {
    createHandler(method, urlPattern, handlerFn) {
      return methods[method](urlPattern, createResolver(handlerFn));
    },

    buildResponse(status, body, headers) {
      if (body === null || body === undefined) {
        return new Response(null, { status, headers });
      }
      const responseHeaders = new Headers(headers);
      responseHeaders.set('content-type', 'application/json');
      return new Response(JSON.stringify(body), { status, headers: responseHeaders });
    },

    createCatchAllHandler(handlerFn) {
      return rest.all('*', createResolver(handlerFn));
    },

    buildErrorResponse() {
      return Response.error();
    },
  };
}
