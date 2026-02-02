import { describe, it, expect } from 'vitest';
import { MockCallHistory, type MockCallHistoryLog } from './mock-call-history';

function createLog(overrides: Partial<MockCallHistoryLog> = {}): MockCallHistoryLog {
  return {
    body: null,
    method: 'GET',
    headers: {},
    fullUrl: 'http://localhost:8787/api/posts',
    origin: 'http://localhost:8787',
    path: '/api/posts',
    searchParams: {},
    protocol: 'http:',
    host: 'localhost:8787',
    port: '8787',
    hash: '',
    ...overrides,
  };
}

describe('MockCallHistory', () => {
  it('should return empty array when no calls recorded', () => {
    const history = new MockCallHistory();

    expect(history.calls()).toEqual([]);
  });

  it('should return recorded calls', () => {
    const history = new MockCallHistory();
    const log = createLog();

    history.record(log);

    expect(history.calls()).toEqual([log]);
  });

  it('should return firstCall', () => {
    const history = new MockCallHistory();
    const first = createLog({ path: '/first' });
    const second = createLog({ path: '/second' });
    history.record(first);
    history.record(second);

    expect(history.firstCall()).toEqual(first);
  });

  it('should return undefined for firstCall when empty', () => {
    const history = new MockCallHistory();

    expect(history.firstCall()).toBeUndefined();
  });

  it('should return lastCall', () => {
    const history = new MockCallHistory();
    const first = createLog({ path: '/first' });
    const second = createLog({ path: '/second' });
    history.record(first);
    history.record(second);

    expect(history.lastCall()).toEqual(second);
  });

  it('should return nthCall (1-indexed)', () => {
    const history = new MockCallHistory();
    const first = createLog({ path: '/first' });
    const second = createLog({ path: '/second' });
    history.record(first);
    history.record(second);

    expect(history.nthCall(1)).toEqual(first);
    expect(history.nthCall(2)).toEqual(second);
  });

  it('should return undefined for nthCall out of bounds', () => {
    const history = new MockCallHistory();
    history.record(createLog());

    expect(history.nthCall(0)).toBeUndefined();
    expect(history.nthCall(2)).toBeUndefined();
  });

  it('should clear all logs', () => {
    const history = new MockCallHistory();
    history.record(createLog());
    history.record(createLog());

    history.clear();

    expect(history.calls()).toEqual([]);
  });

  it('should support Symbol.iterator (spread and for...of)', () => {
    const history = new MockCallHistory();
    const first = createLog({ path: '/first' });
    const second = createLog({ path: '/second' });
    history.record(first);
    history.record(second);

    expect([...history]).toEqual([first, second]);

    const collected: MockCallHistoryLog[] = [];
    for (const log of history) {
      collected.push(log);
    }
    expect(collected).toEqual([first, second]);
  });

  describe('filterCalls', () => {
    it('should filter calls using function predicate', () => {
      const history = new MockCallHistory();
      history.record(createLog({ method: 'GET', path: '/posts' }));
      history.record(createLog({ method: 'POST', path: '/posts' }));
      history.record(createLog({ method: 'GET', path: '/users' }));

      const result = history.filterCalls((log) => log.method === 'GET');

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('/posts');
      expect(result[1].path).toBe('/users');
    });

    it('should filter calls using RegExp against toString()', () => {
      const history = new MockCallHistory();
      history.record(createLog({ method: 'GET', path: '/posts' }));
      history.record(createLog({ method: 'POST', path: '/posts' }));

      const result = history.filterCalls(/GET/);

      expect(result).toHaveLength(1);
      expect(result[0].method).toBe('GET');
    });

    it('should filter calls using object criteria with OR (default)', () => {
      const history = new MockCallHistory();
      history.record(createLog({ method: 'GET', path: '/posts' }));
      history.record(createLog({ method: 'POST', path: '/users' }));
      history.record(createLog({ method: 'DELETE', path: '/other' }));

      const result = history.filterCalls({ method: 'GET', path: '/users' });

      expect(result).toHaveLength(2);
    });

    it('should filter calls using object criteria with AND', () => {
      const history = new MockCallHistory();
      history.record(createLog({ method: 'GET', path: '/posts' }));
      history.record(createLog({ method: 'POST', path: '/posts' }));
      history.record(createLog({ method: 'GET', path: '/users' }));

      const result = history.filterCalls({ method: 'GET', path: '/posts' }, { operator: 'AND' });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ method: 'GET', path: '/posts' });
    });
  });

  describe('filterCallsByMethod', () => {
    it('should filter by method string', () => {
      const history = new MockCallHistory();
      history.record(createLog({ method: 'GET' }));
      history.record(createLog({ method: 'POST' }));

      expect(history.filterCallsByMethod('GET')).toHaveLength(1);
    });

    it('should filter by method RegExp', () => {
      const history = new MockCallHistory();
      history.record(createLog({ method: 'GET' }));
      history.record(createLog({ method: 'POST' }));
      history.record(createLog({ method: 'PUT' }));

      expect(history.filterCallsByMethod(/P(OST|UT)/)).toHaveLength(2);
    });
  });

  describe('filterCallsByPath', () => {
    it('should filter by path string', () => {
      const history = new MockCallHistory();
      history.record(createLog({ path: '/posts' }));
      history.record(createLog({ path: '/users' }));

      expect(history.filterCallsByPath('/posts')).toHaveLength(1);
    });

    it('should filter by path RegExp', () => {
      const history = new MockCallHistory();
      history.record(createLog({ path: '/posts/1' }));
      history.record(createLog({ path: '/posts/2' }));
      history.record(createLog({ path: '/users' }));

      expect(history.filterCallsByPath(/^\/posts/)).toHaveLength(2);
    });
  });

  describe('filterCallsByOrigin', () => {
    it('should filter by origin string', () => {
      const history = new MockCallHistory();
      history.record(createLog({ origin: 'http://localhost:8787' }));
      history.record(createLog({ origin: 'https://graph.threads.net' }));

      expect(history.filterCallsByOrigin('http://localhost:8787')).toHaveLength(1);
    });

    it('should filter by origin RegExp', () => {
      const history = new MockCallHistory();
      history.record(createLog({ origin: 'http://localhost:8787' }));
      history.record(createLog({ origin: 'https://graph.threads.net' }));

      expect(history.filterCallsByOrigin(/threads\.net/)).toHaveLength(1);
    });
  });
});
