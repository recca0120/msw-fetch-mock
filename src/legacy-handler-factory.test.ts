import { describe, expect, it, vi } from 'vitest';
import { createLegacyHandlerFactory, type LegacyRestApi } from './legacy-handler-factory';

/* ---------- MSW legacy (v1) API mocks ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type V1Resolver = (...args: any[]) => any;

function createMockRestApi(): LegacyRestApi & { _resolvers: Map<string, V1Resolver> } {
	const resolvers = new Map<string, V1Resolver>();

	const createMethod = (httpMethod: string) => (url: string | RegExp, resolver: V1Resolver) => {
		const key = `${httpMethod} ${url}`;
		resolvers.set(key, resolver);
		return { key, method: httpMethod, url };
	};

	return {
		get: createMethod('GET'),
		post: createMethod('POST'),
		put: createMethod('PUT'),
		delete: createMethod('DELETE'),
		patch: createMethod('PATCH'),
		_resolvers: resolvers,
	};
}

function createMockV1Request(options: {
	url: string;
	method: string;
	body?: unknown;
	headers?: Record<string, string>;
}) {
	return {
		url: new URL(options.url),
		method: options.method,
		body: options.body ?? null,
		headers: {
			all: () => options.headers ?? {},
		},
	};
}

function createMockV1Res() {
	const collected: unknown[] = [];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const res: any = (...transformers: unknown[]) => {
		collected.push(...transformers);
		return { _type: 'response', transformers: collected };
	};
	res.networkError = (msg: string) => ({ _type: 'networkError', message: msg });

	return { res, collected };
}

function createMockV1Ctx() {
	return {
		status: (code: number) => ({ _type: 'status', value: code }),
		json: (data: unknown) => ({ _type: 'json', value: data }),
		body: (text: string) => ({ _type: 'body', value: text }),
		set: (name: string, value: string) => ({ _type: 'header', name, value }),
	};
}

/* ---------- Tests ---------- */

describe('legacyHandlerFactory', () => {
	describe('buildResponse', () => {
		it('should create JSON response with correct status and body', async () => {
			const factory = createLegacyHandlerFactory(createMockRestApi());
			const response = factory.buildResponse(200, { ok: true });

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
		});

		it('should create empty response for null body', () => {
			const factory = createLegacyHandlerFactory(createMockRestApi());
			const response = factory.buildResponse(204, null);

			expect(response.status).toBe(204);
		});

		it('should create empty response for undefined body', () => {
			const factory = createLegacyHandlerFactory(createMockRestApi());
			const response = factory.buildResponse(204, undefined);

			expect(response.status).toBe(204);
		});

		it('should include custom headers', () => {
			const factory = createLegacyHandlerFactory(createMockRestApi());
			const headers = new Headers({ 'X-Custom': 'test' });
			const response = factory.buildResponse(200, { ok: true }, headers);

			expect(response.headers.get('X-Custom')).toBe('test');
		});

		it('should set content-type to application/json for JSON body', () => {
			const factory = createLegacyHandlerFactory(createMockRestApi());
			const response = factory.buildResponse(200, { ok: true });

			expect(response.headers.get('content-type')).toBe('application/json');
		});
	});

	describe('buildErrorResponse', () => {
		it('should create a network error response', () => {
			const factory = createLegacyHandlerFactory(createMockRestApi());
			const response = factory.buildErrorResponse();

			expect(response.type).toBe('error');
		});
	});

	describe('createHandler', () => {
		it('should register handler using the correct REST method', () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(undefined);
			factory.createHandler('GET', '/api/data', handlerFn);

			expect(restApi._resolvers.has('GET /api/data')).toBe(true);
		});

		it('should register handler for POST method', () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(undefined);
			factory.createHandler('POST', '/api/data', handlerFn);

			expect(restApi._resolvers.has('POST /api/data')).toBe(true);
		});

		it('should support RegExp URL patterns', () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);
			const pattern = /^http:\/\/example\.com/;

			const handlerFn = vi.fn().mockResolvedValue(undefined);
			factory.createHandler('GET', pattern, handlerFn);

			expect(restApi._resolvers.has(`GET ${pattern}`)).toBe(true);
		});

		it('should convert legacy request to standard Request and call handlerFn', async () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(factory.buildResponse(200, { ok: true }));
			factory.createHandler('POST', '/api/data', handlerFn);

			const resolver = restApi._resolvers.get('POST /api/data')!;
			const req = createMockV1Request({
				url: 'http://localhost/api/data',
				method: 'POST',
				body: { key: 'value' },
				headers: { 'content-type': 'application/json' },
			});
			const { res } = createMockV1Res();
			const ctx = createMockV1Ctx();

			await resolver(req, res, ctx);

			expect(handlerFn).toHaveBeenCalledWith(expect.any(Request));
			const passedRequest = handlerFn.mock.calls[0][0] as Request;
			expect(passedRequest.method).toBe('POST');
			expect(passedRequest.url).toBe('http://localhost/api/data');
		});

		it('should pass request body for POST requests', async () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(factory.buildResponse(200, { ok: true }));
			factory.createHandler('POST', '/api/data', handlerFn);

			const resolver = restApi._resolvers.get('POST /api/data')!;
			const req = createMockV1Request({
				url: 'http://localhost/api/data',
				method: 'POST',
				body: { key: 'value' },
			});
			const { res } = createMockV1Res();
			const ctx = createMockV1Ctx();

			await resolver(req, res, ctx);

			const passedRequest = handlerFn.mock.calls[0][0] as Request;
			expect(await passedRequest.text()).toBe('{"key":"value"}');
		});

		it('should pass string body as-is for POST requests', async () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(factory.buildResponse(200, { ok: true }));
			factory.createHandler('POST', '/api/data', handlerFn);

			const resolver = restApi._resolvers.get('POST /api/data')!;
			const req = createMockV1Request({
				url: 'http://localhost/api/data',
				method: 'POST',
				body: 'raw text body',
			});
			const { res } = createMockV1Res();
			const ctx = createMockV1Ctx();

			await resolver(req, res, ctx);

			const passedRequest = handlerFn.mock.calls[0][0] as Request;
			expect(await passedRequest.text()).toBe('raw text body');
		});

		it('should not include body for GET requests', async () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(factory.buildResponse(200, { ok: true }));
			factory.createHandler('GET', '/api/data', handlerFn);

			const resolver = restApi._resolvers.get('GET /api/data')!;
			const req = createMockV1Request({
				url: 'http://localhost/api/data',
				method: 'GET',
			});
			const { res } = createMockV1Res();
			const ctx = createMockV1Ctx();

			await resolver(req, res, ctx);

			const passedRequest = handlerFn.mock.calls[0][0] as Request;
			expect(await passedRequest.text()).toBe('');
		});

		it('should convert response to legacy res(ctx...) format', async () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(factory.buildResponse(200, { ok: true }));
			factory.createHandler('GET', '/api/data', handlerFn);

			const resolver = restApi._resolvers.get('GET /api/data')!;
			const req = createMockV1Request({ url: 'http://localhost/api/data', method: 'GET' });
			const { res, collected } = createMockV1Res();
			const ctx = createMockV1Ctx();

			const result = await resolver(req, res, ctx);

			expect(result).toBeDefined();
			expect(collected).toContainEqual({ _type: 'status', value: 200 });
			expect(collected).toContainEqual({ _type: 'body', value: '{"ok":true}' });
		});

		it('should copy response headers to legacy format', async () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const headers = new Headers({ 'X-Custom': 'test-value' });
			const handlerFn = vi
				.fn()
				.mockResolvedValue(factory.buildResponse(200, { ok: true }, headers));
			factory.createHandler('GET', '/api/data', handlerFn);

			const resolver = restApi._resolvers.get('GET /api/data')!;
			const req = createMockV1Request({ url: 'http://localhost/api/data', method: 'GET' });
			const { res, collected } = createMockV1Res();
			const ctx = createMockV1Ctx();

			await resolver(req, res, ctx);

			expect(collected).toContainEqual({ _type: 'header', name: 'x-custom', value: 'test-value' });
		});

		it('should return undefined for passthrough when handlerFn returns undefined', async () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(undefined);
			factory.createHandler('GET', '/api/data', handlerFn);

			const resolver = restApi._resolvers.get('GET /api/data')!;
			const req = createMockV1Request({ url: 'http://localhost/api/data', method: 'GET' });
			const { res } = createMockV1Res();
			const ctx = createMockV1Ctx();

			const result = await resolver(req, res, ctx);

			expect(result).toBeUndefined();
		});

		it('should call res.networkError for error responses', async () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(factory.buildErrorResponse());
			factory.createHandler('GET', '/api/fail', handlerFn);

			const resolver = restApi._resolvers.get('GET /api/fail')!;
			const req = createMockV1Request({ url: 'http://localhost/api/fail', method: 'GET' });
			const { res } = createMockV1Res();
			const ctx = createMockV1Ctx();

			const result = await resolver(req, res, ctx);

			expect(result).toEqual({ _type: 'networkError', message: 'Failed to fetch' });
		});

		it('should pass legacy request headers to standard Request', async () => {
			const restApi = createMockRestApi();
			const factory = createLegacyHandlerFactory(restApi);

			const handlerFn = vi.fn().mockResolvedValue(factory.buildResponse(200, { ok: true }));
			factory.createHandler('GET', '/api/data', handlerFn);

			const resolver = restApi._resolvers.get('GET /api/data')!;
			const req = createMockV1Request({
				url: 'http://localhost/api/data',
				method: 'GET',
				headers: { authorization: 'Bearer token-123' },
			});
			const { res } = createMockV1Res();
			const ctx = createMockV1Ctx();

			await resolver(req, res, ctx);

			const passedRequest = handlerFn.mock.calls[0][0] as Request;
			expect(passedRequest.headers.get('authorization')).toBe('Bearer token-123');
		});
	});
});
