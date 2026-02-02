import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { createFetchMock } from './mock-server';

const API_BASE = 'http://localhost:8787';
const API_PREFIX = 'api';

describe('createFetchMock', () => {
  const fetchMock = createFetchMock();

  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => fetchMock.assertNoPendingInterceptors());

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
      let capturedBody: unknown;

      fetchMock
        .get(`${API_BASE}/${API_PREFIX}`)
        .intercept({ path: '/posts', method: 'POST' })
        .reply(200, (req: { body: string | null }) => {
          capturedBody = JSON.parse(req.body as string);
          return { id: 'new-post' };
        });

      await fetch(`${API_BASE}/${API_PREFIX}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello' }),
      });

      expect(capturedBody).toEqual({ content: 'Hello' });
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

  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => fetchMock.assertNoPendingInterceptors());
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

  beforeAll(() => {
    fetchMock.activate();
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

  beforeAll(() => {
    fetchMock.activate();
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

  beforeAll(() => {
    fetchMock.activate();
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

  beforeEach(() => {
    fetchMock.activate();
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

describe('call history', () => {
  const fetchMock = createFetchMock();

  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => {
    fetchMock.clearCallHistory();
    fetchMock.assertNoPendingInterceptors();
  });

  afterAll(() => fetchMock.deactivate());

  it('should record GET request properties', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts`);

    const call = fetchMock.getCallHistory().lastCall()!;
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

    const call = fetchMock.getCallHistory().lastCall()!;
    expect(call.body).toBe('{"text":"Hello"}');
    expect(JSON.parse(call.body!)).toEqual({ text: 'Hello' });
  });

  it('should record request headers', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/data', method: 'GET' })
      .reply(200, { ok: true });

    await fetch(`${API_BASE}/${API_PREFIX}/data`, {
      headers: { Authorization: 'Bearer token-123' },
    });

    const call = fetchMock.getCallHistory().lastCall()!;
    expect(call.headers['authorization']).toBe('Bearer token-123');
  });

  it('should record searchParams', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET', query: { limit: '10', offset: '20' } })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts?limit=10&offset=20`);

    const call = fetchMock.getCallHistory().lastCall()!;
    expect(call.searchParams).toEqual({ limit: '10', offset: '20' });
  });

  it('should clear call history with clearCallHistory()', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts`);
    expect(fetchMock.getCallHistory().calls()).toHaveLength(1);

    fetchMock.clearCallHistory();

    expect(fetchMock.getCallHistory().calls()).toEqual([]);
  });

  it('should clear history on deactivate()', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts`);
    expect(fetchMock.getCallHistory().calls()).toHaveLength(1);

    fetchMock.deactivate();
    expect(fetchMock.getCallHistory().calls()).toEqual([]);

    // Re-activate for remaining tests
    fetchMock.activate();
  });

  it('should NOT clear history on assertNoPendingInterceptors()', async () => {
    fetchMock
      .get(`${API_BASE}/${API_PREFIX}`)
      .intercept({ path: '/posts', method: 'GET' })
      .reply(200, { posts: [] });

    await fetch(`${API_BASE}/${API_PREFIX}/posts`);

    fetchMock.assertNoPendingInterceptors();

    expect(fetchMock.getCallHistory().calls()).toHaveLength(1);
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

    expect(fetchMock.getCallHistory().calls()).toHaveLength(3);
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

    expect(fetchMock.getCallHistory().calls()).toHaveLength(5);
  });
});
