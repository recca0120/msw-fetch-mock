import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { FetchMock } from './fetch-mock';
import { NodeMswAdapter } from './node-adapter';
import { createFetchMock, fetchMock as singletonFetchMock } from './node';

const API_BASE = 'http://localhost:8787';
const API_PREFIX = 'api';

describe('FetchMock', () => {
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
  });

  describe('external origin', () => {
    it('should intercept requests to a different origin', async () => {
      fetchMock
        .get('https://graph.threads.net')
        .intercept({ path: '/v1.0/user/threads', method: 'POST' })
        .reply(200, { id: 'container_123' });

      const response = await fetch('https://graph.threads.net/v1.0/user/threads', {
        method: 'POST',
        body: JSON.stringify({ text: 'Hello' }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: 'container_123' });
    });
  });

  describe('reply with callback', () => {
    it('should pass request to reply callback', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts', method: 'POST' })
        .reply(200, { id: 'new-post' });

      await fetch(`${API_BASE}/${API_PREFIX}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello' }),
      });

      expect(fetchMock.calls.lastCall()!.json()).toEqual({ content: 'Hello' });
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

  describe('path function matcher', () => {
    it('should match path using function', async () => {
      fetchMock
        .get('https://graph.threads.net')
        .intercept({
          path: (path: string) => path.startsWith('/v1.0/me'),
          method: 'GET',
        })
        .reply(200, { id: 'user-1', name: 'Test User' });

      const response = await fetch('https://graph.threads.net/v1.0/me?fields=id,name');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: 'user-1', name: 'Test User' });
    });

    it('should capture path in function matcher', async () => {
      let capturedPath = '';

      fetchMock
        .get('https://graph.threads.net')
        .intercept({
          path: (path: string) => {
            if (path.startsWith('/v1.0/me')) {
              capturedPath = path;
              return true;
            }
            return false;
          },
          method: 'GET',
        })
        .reply(200, { id: 'user-1' });

      await fetch('https://graph.threads.net/v1.0/me?fields=id,name');

      expect(capturedPath).toBe('/v1.0/me?fields=id,name');
    });

    it('should receive path relative to origin when origin has path prefix', async () => {
      let capturedPath = '';

      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({
          path: (path: string) => {
            capturedPath = path;
            return path.startsWith('/posts');
          },
          method: 'GET',
        })
        .reply(200, { posts: [] });

      await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10&offset=20`);

      expect(capturedPath).toBe('/posts?limit=10&offset=20');
    });
  });

  describe('headers matching in intercept', () => {
    it('should match request headers', async () => {
      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({
          path: '/models',
          method: 'GET',
          headers: { Authorization: 'Bearer test-api-key' },
        })
        .reply(200, { models: [] });

      const response = await fetch(`${API_BASE}/${API_PREFIX}/models`, {
        headers: { Authorization: 'Bearer test-api-key' },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ models: [] });
    });
  });

  describe('body matching in intercept', () => {
    it('should match request body using function', async () => {
      const expectedBody = { prompt: 'Hello', model: 'gpt-4' };

      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({
          path: '/completions',
          method: 'POST',
          body: (body) => {
            const parsed = JSON.parse(body);
            return JSON.stringify(parsed) === JSON.stringify(expectedBody);
          },
        })
        .reply(200, { text: 'Hi there' });

      const response = await fetch(`${API_BASE}/${API_PREFIX}/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expectedBody),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ text: 'Hi there' });
    });
  });
});

describe('query matching', () => {
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

  it('should match exact query params', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET', query: { limit: '10', offset: '20' } })
      .reply(200, { posts: [] });

    const response = await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10&offset=20`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ posts: [] });
  });

  it('should not match when query params differ', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET', query: { limit: '10' } })
      .reply(200, { posts: [] });

    // fetch with different query - should NOT match, so the interceptor stays pending
    await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=99`).catch(() => null);

    // Clean up: the interceptor was not consumed
    expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
    fetchMock.reset();
  });

  it('should match query params regardless of order', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET', query: { offset: '20', limit: '10' } })
      .reply(200, { posts: [] });

    const response = await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10&offset=20`);

    expect(response.status).toBe(200);
  });
});

describe('times', () => {
  const fetchMock = createFetchMock();

  beforeAll(async () => {
    await fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterAll(() => fetchMock.deactivate());

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

  it('should be pending when not all times consumed', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true })
      .times(3);

    await fetch(`${API_BASE}/${API_PREFIX}/health`);

    expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
  });
});

describe('persist', () => {
  const fetchMock = createFetchMock();

  beforeAll(async () => {
    await fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterAll(() => fetchMock.deactivate());

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

describe('pendingInterceptors', () => {
  const fetchMock = createFetchMock();

  beforeAll(async () => {
    await fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterAll(() => fetchMock.deactivate());

  it('should return empty array when no interceptors', () => {
    expect(fetchMock.pendingInterceptors()).toEqual([]);
  });

  it('should return pending interceptors with metadata', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    const pending = fetchMock.pendingInterceptors();

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      origin: `${API_BASE}/${API_PREFIX}`,
      path: '/posts',
      method: 'GET',
      consumed: false,
      timesInvoked: 0,
      times: 1,
      persist: false,
    });

    // Clean up
    await fetch(`${API_BASE}/${API_PREFIX}/posts`);
    fetchMock.assertNoPendingInterceptors();
  });

  it('should track timesInvoked for times(n)', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true })
      .times(3);

    await fetch(`${API_BASE}/${API_PREFIX}/health`);
    await fetch(`${API_BASE}/${API_PREFIX}/health`);

    const pending = fetchMock.pendingInterceptors();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      timesInvoked: 2,
      times: 3,
      consumed: false,
    });

    // Consume remaining
    await fetch(`${API_BASE}/${API_PREFIX}/health`);
    fetchMock.assertNoPendingInterceptors();
  });

  it('should not include consumed one-shot interceptors', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true });

    await fetch(`${API_BASE}/${API_PREFIX}/health`);

    expect(fetchMock.pendingInterceptors()).toHaveLength(0);
    fetchMock.assertNoPendingInterceptors();
  });

  it('should include persist interceptors that have not been invoked', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true })
      .persist();

    const pending = fetchMock.pendingInterceptors();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ persist: true, timesInvoked: 0 });

    // Uninvoked persist interceptor is pending per undici spec
    expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
  });
});

describe('assertNoPendingInterceptors', () => {
  const fetchMock = createFetchMock();

  beforeEach(async () => {
    await fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => fetchMock.deactivate());

  it('should pass when all interceptors are consumed', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true });

    await fetch(`${API_BASE}/${API_PREFIX}/health`);

    expect(() => fetchMock.assertNoPendingInterceptors()).not.toThrow();
  });

  it('should throw when interceptors are not consumed', () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/unused', method: 'GET' })
      .reply(200, { data: 'never fetched' });

    expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
  });
});

describe('reset', () => {
  const fetchMock = createFetchMock();

  beforeEach(async () => {
    await fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => fetchMock.deactivate());

  it('should clear interceptors', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true });

    fetchMock.reset();

    expect(fetchMock.pendingInterceptors()).toHaveLength(0);
  });

  it('should clear call history', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true });

    await fetch(`${API_BASE}/${API_PREFIX}/health`);
    expect(fetchMock.calls.length).toBe(1);

    fetchMock.reset();

    expect(fetchMock.calls.length).toBe(0);
  });

  it('should reset MSW handlers so subsequent requests are unhandled', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true })
      .persist();

    fetchMock.reset();

    await expect(fetch(`${API_BASE}/${API_PREFIX}/health`)).rejects.toThrow();
  });

  it('should allow registering new interceptors after reset', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/old', method: 'GET' })
      .reply(200, { old: true });

    fetchMock.reset();

    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/new', method: 'GET' })
      .reply(200, { new: true });

    const res = await fetch(`${API_BASE}/${API_PREFIX}/new`);
    expect(await res.json()).toEqual({ new: true });

    fetchMock.reset();
  });
});

describe('call history', () => {
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
    expect(call.protocol).toBe('http:');
    expect(call.host).toBe('localhost:8787');
    expect(call.port).toBe('8787');
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

  it('should record request headers', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/data', method: 'GET' })
      .reply(200, { ok: true });

    await fetch(`${API_BASE}/${API_PREFIX}/data`, {
      headers: { Authorization: 'Bearer token-123' },
    });

    const call = fetchMock.calls.lastCall()!;
    expect(call.headers['authorization']).toBe('Bearer token-123');
  });

  it('should record searchParams', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET', query: { limit: '10', offset: '20' } })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10&offset=20`);

    const call = fetchMock.calls.lastCall()!;
    expect(call.searchParams).toEqual({ limit: '10', offset: '20' });
  });

  it('should clear call history with calls.clear()', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts`);
    expect(fetchMock.calls.length).toBe(1);

    fetchMock.calls.clear();

    expect(fetchMock.calls.length).toBe(0);
  });

  it('should clear history on deactivate()', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts`);
    expect(fetchMock.calls.length).toBe(1);

    fetchMock.deactivate();
    expect(fetchMock.calls.length).toBe(0);

    // Re-activate for remaining tests
    await fetchMock.activate();
  });

  it('should preserve history on assertNoPendingInterceptors()', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts`);

    fetchMock.assertNoPendingInterceptors();

    expect(fetchMock.calls.length).toBe(1);
  });

  it('should return call history via getCallHistory()', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts`);

    expect(fetchMock.getCallHistory()).toBe(fetchMock.calls);
    expect(fetchMock.getCallHistory().length).toBe(1);
  });

  it('should clear history via clearCallHistory()', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts`);
    expect(fetchMock.calls.length).toBe(1);

    fetchMock.clearCallHistory();

    expect(fetchMock.calls.length).toBe(0);
  });

  it('should record every call with times(n)', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true })
      .times(3);

    for (let i = 0; i < 3; i++) {
      await fetch(`${API_BASE}/${API_PREFIX}/health`);
    }

    expect(fetchMock.calls.length).toBe(3);
  });

  it('should record every call with persist()', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/health', method: 'GET' })
      .reply(200, { ok: true })
      .persist();

    for (let i = 0; i < 5; i++) {
      await fetch(`${API_BASE}/${API_PREFIX}/health`);
    }

    expect(fetchMock.calls.length).toBe(5);
  });
});

describe('enableNetConnect', () => {
  const fetchMock = createFetchMock();

  beforeEach(async () => {
    await fetchMock.activate();
  });

  afterEach(() => fetchMock.deactivate());

  it('should block unmatched requests when disableNetConnect() is called', async () => {
    fetchMock.disableNetConnect();

    await expect(fetch('http://no-such-host.test/path')).rejects.toThrow(/request/i);
  });

  it('should allow all requests when enableNetConnect() is called without args', async () => {
    fetchMock.disableNetConnect();
    fetchMock.enableNetConnect();

    // Should NOT throw MSW handler error; will throw network error instead
    const error = await fetch('http://192.0.2.1:1/test').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/request handler/i);
  });

  it('should allow specific host when enableNetConnect(string) is called', async () => {
    fetchMock.disableNetConnect();
    fetchMock.enableNetConnect('192.0.2.1:1');

    const error = await fetch('http://192.0.2.1:1/test').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/request handler/i);
  });

  it('should block non-matching host when enableNetConnect(string) is called', async () => {
    fetchMock.disableNetConnect();
    fetchMock.enableNetConnect('allowed.test');

    await expect(fetch('http://blocked.test/path')).rejects.toThrow(/request/i);
  });

  it('should allow matching host when enableNetConnect(RegExp) is called', async () => {
    fetchMock.disableNetConnect();
    fetchMock.enableNetConnect(/192\.0\.2/);

    const error = await fetch('http://192.0.2.1:1/test').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/request handler/i);
  });

  it('should allow matching host when enableNetConnect(function) is called', async () => {
    fetchMock.disableNetConnect();
    fetchMock.enableNetConnect((host) => host.startsWith('192.0.2'));

    const error = await fetch('http://192.0.2.1:1/test').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/request handler/i);
  });
});

describe('replyWithError', () => {
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

  it('should make fetch reject with an error', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/fail', method: 'GET' })
      .replyWithError(new Error('network failure'));

    await expect(fetch(`${API_BASE}/${API_PREFIX}/fail`)).rejects.toThrow();
  });
});

describe('delay', () => {
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
    expect(elapsed).toBeGreaterThanOrEqual(90); // allow 10ms tolerance
  });
});

describe('activate guard', () => {
  it('should throw when another MSW server is already listening', async () => {
    const externalServer = setupServer();
    externalServer.listen();

    try {
      const standalone = createFetchMock();
      await expect(standalone.activate()).rejects.toThrow(/already active/i);
    } finally {
      externalServer.close();
    }
  });

  it('should not throw when using external server mode', async () => {
    const externalServer = setupServer();
    externalServer.listen();

    try {
      const shared = new FetchMock(new NodeMswAdapter(externalServer));
      await expect(shared.activate()).resolves.toBeUndefined();
    } finally {
      externalServer.close();
    }
  });
});

describe('onUnhandledRequest', () => {
  it('should block unhandled requests when onUnhandledRequest is "error"', async () => {
    const fm = createFetchMock();
    await fm.activate({ onUnhandledRequest: 'error' });

    try {
      await expect(fetch('http://no-such-host.test/path')).rejects.toThrow(/request/i);
    } finally {
      fm.deactivate();
    }
  });

  it('should allow unhandled requests through when onUnhandledRequest is "warn"', async () => {
    const fm = createFetchMock();
    await fm.activate({ onUnhandledRequest: 'warn' });

    try {
      const error = await fetch('http://192.0.2.1:1/test').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/request handler/i);
    } finally {
      fm.deactivate();
    }
  });

  it('should silently allow unhandled requests when onUnhandledRequest is "bypass"', async () => {
    const fm = createFetchMock();
    await fm.activate({ onUnhandledRequest: 'bypass' });

    try {
      const error = await fetch('http://192.0.2.1:1/test').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/request handler/i);
    } finally {
      fm.deactivate();
    }
  });

  it('should invoke custom callback for unhandled requests', async () => {
    const fm = createFetchMock();
    let capturedUrl = '';
    await fm.activate({
      onUnhandledRequest: (request) => {
        capturedUrl = request.url;
        // Not calling print.error() → request passes through
      },
    });

    try {
      await fetch('http://192.0.2.1:1/test').catch(() => null);
      expect(capturedUrl).toBe('http://192.0.2.1:1/test');
    } finally {
      fm.deactivate();
    }
  });

  it('should respect enableNetConnect even in error mode', async () => {
    const fm = createFetchMock();
    await fm.activate({ onUnhandledRequest: 'error' });
    fm.enableNetConnect('192.0.2.1:1');

    try {
      const error = await fetch('http://192.0.2.1:1/test').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/request handler/i);
    } finally {
      fm.deactivate();
    }
  });

  it('should not call server.listen() for external server mode', async () => {
    const externalServer = setupServer();
    externalServer.listen();

    try {
      const fm = new FetchMock(new NodeMswAdapter(externalServer));
      // activate() with options should not throw or call listen() again
      await expect(fm.activate({ onUnhandledRequest: 'warn' })).resolves.toBeUndefined();
    } finally {
      externalServer.close();
    }
  });
});

describe('consumed interceptor', () => {
  it('should treat consumed interceptor request as unhandled', async () => {
    const captured: string[] = [];
    const fm = createFetchMock();
    await fm.activate({
      onUnhandledRequest: (request) => {
        captured.push(request.url);
      },
    });

    fm.get('http://example.test')
      .intercept({ path: '/data', method: 'GET' })
      .reply(200, { ok: true });

    // Consume the interceptor
    await fetch('http://example.test/data');

    // Second request - consumed interceptor should trigger onUnhandledRequest callback
    await fetch('http://example.test/data').catch(() => null);

    expect(captured).toContain('http://example.test/data');

    fm.deactivate();
  });
});

describe('singleton export', () => {
  it('should export fetchMock as a FetchMock instance', () => {
    expect(singletonFetchMock).toBeInstanceOf(FetchMock);
  });
});
