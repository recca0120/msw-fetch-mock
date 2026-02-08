import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { createFetchMock, fetchMock as singletonFetchMock, FetchMock } from './native';

const API_BASE = 'http://localhost:8787';
const API_PREFIX = 'api';

describe('FetchMock (native adapter)', () => {
  const fetchMock = createFetchMock();

  beforeAll(async () => {
    await fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => {
    fetchMock.assertNoPendingInterceptors();
    fetchMock.reset();
  });

  afterAll(() => fetchMock.deactivate());

  describe('intercept + reply', () => {
    it('should intercept GET request', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts', method: 'GET' })
        .reply(200, { posts: [{ id: '1' }] });

      const response = await fetch(`${API_BASE}/${API_PREFIX}/posts`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ posts: [{ id: '1' }] });
    });

    it('should intercept POST request', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts', method: 'POST' })
        .reply(201, { id: 'new-post' });

      const response = await fetch(`${API_BASE}/${API_PREFIX}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello' }),
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ id: 'new-post' });
    });

    it('should intercept PUT request', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts/1', method: 'PUT' })
        .reply(200, { id: '1', content: 'updated' });

      const response = await fetch(`${API_BASE}/${API_PREFIX}/posts/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'updated' }),
      });

      expect(response.status).toBe(200);
    });

    it('should intercept DELETE request', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts/1', method: 'DELETE' })
        .reply(204, null);

      const response = await fetch(`${API_BASE}/${API_PREFIX}/posts/1`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(204);
    });

    it('should intercept PATCH request', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts/1', method: 'PATCH' })
        .reply(200, { patched: true });

      const response = await fetch(`${API_BASE}/${API_PREFIX}/posts/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'patched' }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ patched: true });
    });

    it('should correctly match method when multiple interceptors for same path', async () => {
      // Setup GET interceptor
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts', method: 'GET' })
        .reply(200, { type: 'get' });

      // Setup POST interceptor for the same path
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts', method: 'POST' })
        .reply(201, { type: 'post' });

      // Make GET request - should match GET interceptor
      const getResponse = await fetch(`${API_BASE}/${API_PREFIX}/posts`);
      expect(getResponse.status).toBe(200);
      expect(await getResponse.json()).toEqual({ type: 'get' });

      // Make POST request - should match POST interceptor
      const postResponse = await fetch(`${API_BASE}/${API_PREFIX}/posts`, {
        method: 'POST',
        body: JSON.stringify({ content: 'test' }),
      });
      expect(postResponse.status).toBe(201);
      expect(await postResponse.json()).toEqual({ type: 'post' });
    });
  });

  describe('call history', () => {
    it('should record GET request properties', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts', method: 'GET' })
        .reply(200, { posts: [] });

      await fetch(`${API_BASE}/${API_PREFIX}/posts`);

      const call = fetchMock.calls.lastCall()!;
      expect(call.method).toBe('GET');
      expect(call.path).toBe('/api/posts');
      expect(call.fullUrl).toBe(`${API_BASE}/${API_PREFIX}/posts`);
      expect(call.origin).toBe(API_BASE);
    });

    it('should record POST request body', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts', method: 'POST' })
        .reply(201, { id: '1' });

      await fetch(`${API_BASE}/${API_PREFIX}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello' }),
      });

      const call = fetchMock.calls.lastCall()!;
      expect(call.body).toBe('{"text":"Hello"}');
      expect(call.json()).toEqual({ text: 'Hello' });
    });
  });

  describe('times', () => {
    it('should match interceptor exactly N times', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/health', method: 'GET' })
        .reply(200, { ok: true })
        .times(3);

      for (let i = 0; i < 3; i++) {
        const response = await fetch(`${API_BASE}/${API_PREFIX}/health`);
        expect(response.status).toBe(200);
      }

      fetchMock.assertNoPendingInterceptors();
    });
  });

  describe('persist', () => {
    it('should match indefinitely', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/health', method: 'GET' })
        .reply(200, { ok: true })
        .persist();

      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${API_BASE}/${API_PREFIX}/health`);
        expect(response.status).toBe(200);
      }

      fetchMock.assertNoPendingInterceptors();
    });
  });

  describe('replyWithError', () => {
    it('should make fetch reject with an error', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/fail', method: 'GET' })
        .replyWithError(new Error('network failure'));

      await expect(fetch(`${API_BASE}/${API_PREFIX}/fail`)).rejects.toThrow();
    });
  });

  describe('delay', () => {
    it('should delay the response by at least the specified ms', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/slow', method: 'GET' })
        .reply(200, { ok: true })
        .delay(100);

      const start = Date.now();
      const response = await fetch(`${API_BASE}/${API_PREFIX}/slow`);
      const elapsed = Date.now() - start;

      expect(response.status).toBe(200);
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });

  describe('reply with callback', () => {
    it('should support dynamic response via callback', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/echo', method: 'POST' })
        .reply(200, (req: { body: string | null }) => ({ echoed: req.body }));

      const response = await fetch(`${API_BASE}/${API_PREFIX}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      });

      expect(await response.json()).toEqual({ echoed: '{"message":"hello"}' });
    });
  });

  describe('reply(callback) single parameter form', () => {
    it('should accept single callback returning { statusCode, data }', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/echo', method: 'POST' })
        .reply((req) => {
          const body = req.body ? JSON.parse(req.body) : null;
          return { statusCode: 201, data: { echo: body } };
        });

      const response = await fetch(`${API_BASE}/${API_PREFIX}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: 'hello' }),
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ echo: { msg: 'hello' } });
    });
  });

  describe('reply with headers', () => {
    it('should set response headers', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/data', method: 'GET' })
        .reply(200, { value: 1 }, { headers: { 'X-Custom': 'test' } });

      const response = await fetch(`${API_BASE}/${API_PREFIX}/data`);

      expect(response.headers.get('X-Custom')).toBe('test');
      expect(await response.json()).toEqual({ value: 1 });
    });
  });

  describe('reset', () => {
    it('should clear interceptors and call history', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/health', method: 'GET' })
        .reply(200, { ok: true });

      await fetch(`${API_BASE}/${API_PREFIX}/health`);
      expect(fetchMock.calls.length).toBe(1);

      fetchMock.reset();

      expect(fetchMock.calls.length).toBe(0);
      expect(fetchMock.pendingInterceptors()).toHaveLength(0);
    });
  });

  describe('assertNoPendingInterceptors', () => {
    it('should throw when interceptors are not consumed', () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/unused', method: 'GET' })
        .reply(200, { data: 'never fetched' });

      expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
      fetchMock.reset();
    });
  });
});

describe('singleton export (native)', () => {
  it('should export fetchMock as a FetchMock instance', () => {
    expect(singletonFetchMock).toBeInstanceOf(FetchMock);
  });
});

describe('activate returns promise (native)', () => {
  it('should return a value from activate()', async () => {
    const fm = createFetchMock();
    const result = fm.activate();
    // activate can return void or Promise<void>
    if (result instanceof Promise) {
      await result;
    }
    fm.deactivate();
  });
});
