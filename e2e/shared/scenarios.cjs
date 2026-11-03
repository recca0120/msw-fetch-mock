'use strict';

/**
 * The assertions the scenarios use, backed by node:assert (node:test suites).
 * Jest suites pass jestAssert(expect) instead: Jest runs each test file in its own VM
 * context, and node:assert's strict deep equality rejects objects from another realm
 * (e.g. response.json() results), which Jest's own matchers compare correctly.
 */
const nodeAssert = (() => {
  const assert = require('node:assert/strict');
  return {
    equal: (actual, expected) => assert.equal(actual, expected),
    deepEqual: (actual, expected) => assert.deepEqual(actual, expected),
    ok: (value) => assert.ok(value),
    throws: (fn, pattern) => assert.throws(fn, pattern),
    rejects: (fn) => assert.rejects(fn, (err) => err instanceof Error),
  };
})();

/** The same assertions on top of Jest's `expect` (realm-agnostic). */
exports.jestAssert = (expect) => ({
  equal: (actual, expected) => expect(actual).toBe(expected),
  deepEqual: (actual, expected) => expect(actual).toEqual(expected),
  ok: (value) => expect(value).toBeTruthy(),
  throws: (fn, pattern) => expect(fn).toThrow(pattern),
  rejects: (fn) => expect(fn()).rejects.toThrow(),
});

/**
 * The e2e scenarios shared by every Node suite (jest-esm, jest-cjs, node-test, node-cjs,
 * legacy-cjs, native-esm, native-cjs). Each suite passes its test runner and how to create
 * a FetchMock from the entry point it exercises (packaging: ESM/CJS, runner, MSW version).
 *
 * CommonJS on purpose: it is the one format every suite can load (require, import from
 * ESM, Jest ESM) without needing Node's require(esm).
 *
 * @param {object} options
 * @param {string} options.label  title of the scenarios' describe block
 * @param {{ describe: Function, it: Function, before: Function, after: Function, afterEach: Function }} options.runner
 * @param {() => unknown} options.createFetchMock  may return a Promise
 * @param {typeof nodeAssert} [options.assert]  defaults to node:assert
 * @param {boolean} [options.exclusiveActivation]  only one fetchMock may be active at a time
 *   (standalone MSW v2/v3 servers, default); MSW v1 servers can run side by side
 * @returns {{ getFetchMock: () => any }} the suite's FetchMock, for suite-specific tests
 */
exports.defineScenarios = function defineScenarios({
  label,
  runner,
  createFetchMock,
  assert = nodeAssert,
  exclusiveActivation = true,
}) {
  const { describe, it, before, after, afterEach } = runner;
  const API_BASE = 'http://localhost:8787';
  let fetchMock;

  before(async () => {
    fetchMock = await createFetchMock();
    await fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => {
    fetchMock.assertNoPendingInterceptors();
    fetchMock.reset();
  });

  after(() => fetchMock.deactivate());

  describe(label, () => {
    describe('intercept + reply', () => {
      it('should intercept GET request and return JSON', async () => {
        fetchMock
          .get(API_BASE)
          .intercept({ path: '/posts', method: 'GET' })
          .reply(200, { posts: [{ id: '1' }] });

        const response = await fetch(`${API_BASE}/posts`);
        const data = await response.json();

        assert.equal(response.status, 200);
        assert.deepEqual(data, { posts: [{ id: '1' }] });
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
        assert.deepEqual(await response.json(), { id: 'new-post' });
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
        assert.deepEqual(await getResponse.json(), { type: 'get' });

        // Make POST request - should match POST interceptor
        const postResponse = await fetch(`${API_BASE}/posts`, {
          method: 'POST',
          body: JSON.stringify({ content: 'test' }),
        });
        assert.equal(postResponse.status, 201);
        assert.deepEqual(await postResponse.json(), { type: 'post' });
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
        fetchMock
          .get(API_BASE)
          .intercept({ path: '/data', method: 'POST' })
          .reply(200, { ok: true });

        await fetch(`${API_BASE}/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'value' }),
        });

        const call = fetchMock.calls.lastCall();
        assert.equal(call.body, '{"key":"value"}');
        assert.deepEqual(call.json(), { key: 'value' });
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
        fetchMock
          .get(API_BASE)
          .intercept({ path: '/test', method: 'GET' })
          .reply(200, { ok: true });

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
        assert.deepEqual(data, { echoed: '{"message":"hello"}' });
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

        await assert.rejects(() => fetch(`${API_BASE}/fail`));
      });
    });

    describe('activate returns promise', () => {
      it('should return Promise<void> from activate()', async () => {
        if (exclusiveActivation) await fetchMock.deactivate();
        const fm2 = await createFetchMock();
        const result = fm2.activate();
        assert.ok(result instanceof Promise);
        await result;
        await fm2.deactivate();
        if (exclusiveActivation) await fetchMock.activate();
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

    describe('query matching with path query string', () => {
      it('should match when path includes query string - exact match', async () => {
        fetchMock
          .get(API_BASE)
          .intercept({ path: '/api/posts?limit=10', method: 'GET' })
          .reply(200, { posts: [] });

        const response = await fetch(`${API_BASE}/api/posts?limit=10`);
        const data = await response.json();

        assert.equal(response.status, 200);
        assert.deepEqual(data, { posts: [] });
      });

      it('should not match when path includes query string but request query differs', async () => {
        fetchMock
          .get(API_BASE)
          .intercept({ path: '/api/posts?limit=10', method: 'GET' })
          .reply(200, { posts: [] });

        await fetch(`${API_BASE}/api/posts?limit=20`).catch(() => null);

        // Interceptor should still be pending (not consumed)
        assert.throws(() => fetchMock.assertNoPendingInterceptors(), /pending interceptor/i);
        fetchMock.reset();
      });

      it('should match when path includes query string regardless of param order', async () => {
        fetchMock
          .get(API_BASE)
          .intercept({ path: '/api/posts?a=1&b=2', method: 'GET' })
          .reply(200, { posts: [] });

        const response = await fetch(`${API_BASE}/api/posts?b=2&a=1`);
        const data = await response.json();

        assert.equal(response.status, 200);
        assert.deepEqual(data, { posts: [] });
      });
    });
  });

  return { getFetchMock: () => fetchMock };
};
