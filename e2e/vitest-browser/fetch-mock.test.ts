import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupWorker } from 'msw/browser';
import { createFetchMock } from 'msw-fetch-mock/browser';

const API_BASE = 'http://localhost:5173';
const worker = setupWorker();
const fetchMock = createFetchMock(worker);

beforeAll(async () => {
  await fetchMock.activate({ onUnhandledRequest: 'error' });
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});

afterAll(() => fetchMock.deactivate());

describe('vitest-browser integration', () => {
  describe('intercept + reply', () => {
    it('should intercept GET request and return JSON', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/posts', method: 'GET' })
        .reply(200, { posts: [{ id: '1' }] });

      const response = await fetch(`${API_BASE}/posts`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ posts: [{ id: '1' }] });
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

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ id: 'new-post' });
    });
  });

  describe('call history', () => {
    it('should record calls and provide access via lastCall/firstCall', async () => {
      fetchMock.get(API_BASE).intercept({ path: '/a', method: 'GET' }).reply(200, { a: true });
      fetchMock.get(API_BASE).intercept({ path: '/b', method: 'GET' }).reply(200, { b: true });

      await fetch(`${API_BASE}/a`);
      await fetch(`${API_BASE}/b`);

      expect(fetchMock.calls.length).toBe(2);
      expect(fetchMock.calls.firstCall()!.path).toBe('/a');
      expect(fetchMock.calls.lastCall()!.path).toBe('/b');
    });
  });

  describe('assertNoPendingInterceptors', () => {
    it('should throw when unconsumed interceptors exist', () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/unused', method: 'GET' })
        .reply(200, { data: 'never fetched' });

      expect(() => fetchMock.assertNoPendingInterceptors()).toThrow(/pending interceptor/i);
      fetchMock.reset();
    });
  });

  describe('reset', () => {
    it('should clear interceptors and call history', async () => {
      fetchMock.get(API_BASE).intercept({ path: '/test', method: 'GET' }).reply(200, { ok: true });

      await fetch(`${API_BASE}/test`);
      expect(fetchMock.calls.length).toBe(1);

      fetchMock.reset();

      expect(fetchMock.calls.length).toBe(0);
      expect(fetchMock.pendingInterceptors()).toHaveLength(0);
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
      expect(data).toEqual({ echoed: '{"message":"hello"}' });
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

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(fetchMock.calls.length).toBe(2);
    });
  });

  describe('replyWithError', () => {
    it('should make fetch reject with an error', async () => {
      fetchMock
        .get(API_BASE)
        .intercept({ path: '/fail', method: 'GET' })
        .replyWithError(new Error('network failure'));

      await expect(fetch(`${API_BASE}/fail`)).rejects.toThrow();
    });
  });

  describe('activate returns promise', () => {
    it('should return Promise<void> from activate()', async () => {
      const fm2 = createFetchMock(worker);
      const result = fm2.activate();
      expect(result).toBeInstanceOf(Promise);
      await result;
      fm2.deactivate();
    });
  });
});
