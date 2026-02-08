const { describe, it, before, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createFetchMock } = require('msw-fetch-mock/node');

const API_BASE = 'http://localhost:8787';
const fetchMock = createFetchMock();

before(async () => {
  await fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});

after(() => fetchMock.deactivate());

describe('node-cjs integration (require)', () => {
  describe('intercept + reply', () => {
    it('should intercept GET request and return JSON', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/posts', method: 'GET' })
        .reply(200, { posts: [{ id: '1' }] });

      const response = await fetch(`${API_BASE}/posts`);
      const data = await response.json();

      assert.equal(response.status, 200);
      assert.deepStrictEqual(data, { posts: [{ id: '1' }] });
    });

    it('should intercept POST request with body', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/posts', method: 'POST' })
        .reply(201, { id: 'new-post' });

      const response = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello' }),
      });

      assert.equal(response.status, 201);
      assert.deepStrictEqual(await response.json(), { id: 'new-post' });
    });

    it('should correctly match method when multiple interceptors for same path', async () => {
      // Setup GET interceptor
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/posts', method: 'GET' })
        .reply(200, { type: 'get' });

      // Setup POST interceptor for the same path
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/posts', method: 'POST' })
        .reply(201, { type: 'post' });

      // Make GET request - should match GET interceptor
      const getResponse = await fetch(`${API_BASE}/posts`);
      assert.equal(getResponse.status, 200);
      assert.deepStrictEqual(await getResponse.json(), { type: 'get' });

      // Make POST request - should match POST interceptor
      const postResponse = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        body: JSON.stringify({ content: 'test' }),
      });
      assert.equal(postResponse.status, 201);
      assert.deepStrictEqual(await postResponse.json(), { type: 'post' });
    });
  });

  describe('call history', () => {
    it('should record calls and provide access via lastCall/firstCall', async () => {
      fetchMock.get(API_BASE).intercept({ path: '/a', method: 'GET' }).reply(200, { a: true });
      fetchMock.get(API_BASE).intercept({ path: '/b', method: 'GET' }).reply(200, { b: true });

      await fetch(`${API_BASE}/a`);
      await fetch(`${API_BASE}/b`);

      assert.equal(fetchMock.calls.length, 2);
      assert.equal(fetchMock.calls.firstCall().path, '/a');
      assert.equal(fetchMock.calls.lastCall().path, '/b');
    });

    it('should record POST body and parse as JSON', async () => {
      fetchMock.get(API_BASE).intercept({ path: '/data', method: 'POST' }).reply(200, { ok: true });

      await fetch(`${API_BASE}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'value' }),
      });

      const call = fetchMock.calls.lastCall();
      assert.equal(call.body, '{"key":"value"}');
      assert.deepStrictEqual(call.json(), { key: 'value' });
    });
  });

  describe('assertNoPendingInterceptors', () => {
    it('should throw when unconsumed interceptors exist', () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/unused', method: 'GET' })
        .reply(200, { data: 'never fetched' });

      assert.throws(() => fetchMock.assertNoPendingInterceptors(), /pending interceptor/i);
      fetchMock.reset();
    });
  });

  describe('reset', () => {
    it('should clear interceptors and call history', async () => {
      fetchMock.get(API_BASE).intercept({ path: '/test', method: 'GET' }).reply(200, { ok: true });

      await fetch(`${API_BASE}/test`);
      assert.equal(fetchMock.calls.length, 1);

      fetchMock.reset();

      assert.equal(fetchMock.calls.length, 0);
      assert.equal(fetchMock.pendingInterceptors().length, 0);
    });
  });

  describe('reply callback', () => {
    it('should support dynamic response via callback', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/echo', method: 'POST' })
        .reply(200, (req) => ({ echoed: req.body }));

      const response = await fetch(`${API_BASE}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      });

      const data = await response.json();
      assert.deepStrictEqual(data, { echoed: '{"message":"hello"}' });
    });
  });

  describe('times', () => {
    it('should consume interceptor after N uses', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/health', method: 'GET' })
        .reply(200, { ok: true })
        .times(2);

      const r1 = await fetch(`${API_BASE}/health`);
      const r2 = await fetch(`${API_BASE}/health`);

      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(fetchMock.calls.length, 2);
    });
  });

  describe('replyWithError', () => {
    it('should make fetch reject with an error', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/fail', method: 'GET' })
        .replyWithError(new Error('network failure'));

      await assert.rejects(
        () => fetch(`${API_BASE}/fail`),
        (err) => err instanceof Error
      );
    });
  });

  describe('activate returns promise', () => {
    it('should return Promise<void> from activate()', async () => {
      fetchMock.deactivate();
      const fm2 = createFetchMock();
      const result = fm2.activate();
      assert.ok(result instanceof Promise);
      await result;
      fm2.deactivate();
      await fetchMock.activate();
    });
  });

  describe('chained intercept', () => {
    it('should support chained intercept after reply (FIFO order)', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/test' })
        .reply(200, { call: 'first' })
        .intercept({ path: '/test' })
        .reply(200, { call: 'second' });

      const res1 = await fetch(`${API_BASE}/test`);
      const res2 = await fetch(`${API_BASE}/test`);

      assert.equal((await res1.json()).call, 'first');
      assert.equal((await res2.json()).call, 'second');
    });
  });

  describe('FIFO ordering', () => {
    it('should match interceptors in FIFO order (first registered = first matched)', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/api/data', method: 'GET' })
        .reply(200, { order: 1 });

      fetchMock
        .get(API_BASE)
        .intercept({ path: '/api/data', method: 'GET' })
        .reply(200, { order: 2 });

      fetchMock
        .get(API_BASE)
        .intercept({ path: '/api/data', method: 'GET' })
        .reply(200, { order: 3 });

      const res1 = await fetch(`${API_BASE}/api/data`);
      const res2 = await fetch(`${API_BASE}/api/data`);
      const res3 = await fetch(`${API_BASE}/api/data`);

      assert.equal((await res1.json()).order, 1);
      assert.equal((await res2.json()).order, 2);
      assert.equal((await res3.json()).order, 3);
    });

    it('should consume each interceptor once in FIFO order', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/api/retry', method: 'POST' })
        .reply(500, { error: 'Server error' });

      fetchMock
        .get(API_BASE)
        .intercept({ path: '/api/retry', method: 'POST' })
        .reply(200, { success: true });

      const res1 = await fetch(`${API_BASE}/api/retry`, { method: 'POST' });
      assert.equal(res1.status, 500);

      const res2 = await fetch(`${API_BASE}/api/retry`, { method: 'POST' });
      assert.equal(res2.status, 200);
      assert.equal((await res2.json()).success, true);
    });
  });
});
