import { type HandlerFactory, type HttpMethod } from './types';

/** Duck-typed MSW v1 request object */
interface LegacyReq {
  url: { toString(): string };
  method: string;
  headers: { all(): Record<string, string> };
  body?: unknown;
}

/** Duck-typed MSW v1 response composer */
type LegacyRes = {
  (...transformers: unknown[]): unknown;
  networkError(msg: string): unknown;
};

/** Duck-typed MSW v1 context utilities */
interface LegacyCtx {
  status(code: number): unknown;
  set(key: string, value: string): unknown;
  body(text: string): unknown;
}

/** Duck-typed interface for MSW v1's `rest` API methods */
export type LegacyRestMethod = (
  url: string | RegExp,
  resolver: (req: LegacyReq, res: LegacyRes, ctx: LegacyCtx) => unknown
) => unknown;

/** Duck-typed interface for MSW v1's `rest` namespace */
export type LegacyRestApi = Record<Lowercase<HttpMethod> | 'all', LegacyRestMethod>;

/** Convert MSW v1 request object to standard Request */
function convertV1Request(req: LegacyReq): Request {
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
async function convertToV1Response(
  response: Response,
  res: LegacyRes,
  ctx: LegacyCtx
): Promise<unknown> {
  if (response.type === 'error') {
    return res.networkError('Failed to fetch');
  }

  const transformers: unknown[] = [ctx.status(response.status)];

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

  const createResolver = (handlerFn: (request: Request) => Promise<Response | undefined>) => {
    return async (req: LegacyReq, res: LegacyRes, ctx: LegacyCtx) => {
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
