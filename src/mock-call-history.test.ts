import { describe, expect, it } from 'vitest';
import {
	MockCallHistory,
	type MockCallHistoryLog,
	type MockCallHistoryLogData,
} from './mock-call-history';

function createLog(overrides: Partial<MockCallHistoryLogData> = {}): MockCallHistoryLogData {
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

		expect(history.all()).toEqual([]);
	});

	it('should return recorded calls', () => {
		const history = new MockCallHistory();
		const log = createLog();

		history.record(log);

		expect(history.all()).toEqual([log]);
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

		expect(history.all()).toEqual([]);
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

	describe('called()', () => {
		it('should return false when no calls recorded', () => {
			const history = new MockCallHistory();

			expect(history.called()).toBe(false);
		});

		it('should return true when calls exist', () => {
			const history = new MockCallHistory();
			history.record(createLog());

			expect(history.called()).toBe(true);
		});

		it('should return true when filter matches', () => {
			const history = new MockCallHistory();
			history.record(createLog({ method: 'GET' }));
			history.record(createLog({ method: 'POST' }));

			expect(history.called({ method: 'POST' })).toBe(true);
		});

		it('should return false when filter does not match', () => {
			const history = new MockCallHistory();
			history.record(createLog({ method: 'GET' }));

			expect(history.called({ method: 'DELETE' })).toBe(false);
		});
	});

	describe('length', () => {
		it('should return 0 when empty', () => {
			const history = new MockCallHistory();

			expect(history.length).toBe(0);
		});

		it('should return number of recorded calls', () => {
			const history = new MockCallHistory();
			history.record(createLog());
			history.record(createLog());
			history.record(createLog());

			expect(history.length).toBe(3);
		});
	});

	describe('inline filtering', () => {
		it('should return last matching call with lastCall(filter)', () => {
			const history = new MockCallHistory();
			history.record(createLog({ method: 'GET', path: '/first' }));
			history.record(createLog({ method: 'POST', path: '/submit' }));
			history.record(createLog({ method: 'GET', path: '/second' }));

			expect(history.lastCall({ method: 'GET' })?.path).toBe('/second');
		});

		it('should return first matching call with firstCall(filter)', () => {
			const history = new MockCallHistory();
			history.record(createLog({ method: 'GET', path: '/first' }));
			history.record(createLog({ method: 'POST', path: '/submit' }));
			history.record(createLog({ method: 'POST', path: '/submit2' }));

			expect(history.firstCall({ method: 'POST' })?.path).toBe('/submit');
		});

		it('should return nth matching call with nthCall(n, filter)', () => {
			const history = new MockCallHistory();
			history.record(createLog({ method: 'GET', path: '/a' }));
			history.record(createLog({ method: 'POST', path: '/x' }));
			history.record(createLog({ method: 'GET', path: '/b' }));
			history.record(createLog({ method: 'GET', path: '/c' }));

			expect(history.nthCall(2, { method: 'GET' })?.path).toBe('/b');
		});

		it('should return undefined when filter has no match', () => {
			const history = new MockCallHistory();
			history.record(createLog({ method: 'GET' }));

			expect(history.lastCall({ method: 'DELETE' })).toBeUndefined();
		});
	});

	describe('json()', () => {
		it('should parse JSON body', () => {
			const history = new MockCallHistory();
			history.record(createLog({ body: '{"text":"Hello"}' }));

			expect(history.lastCall()?.json()).toEqual({ text: 'Hello' });
		});

		it('should return null when body is null', () => {
			const history = new MockCallHistory();
			history.record(createLog({ body: null }));

			expect(history.lastCall()?.json()).toBeNull();
		});

		it('should throw SyntaxError for invalid JSON', () => {
			const history = new MockCallHistory();
			history.record(createLog({ body: 'not json' }));

			expect(() => history.lastCall()?.json()).toThrow(SyntaxError);
		});
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

		it('should filter by protocol in object criteria', () => {
			const history = new MockCallHistory();
			history.record(createLog({ protocol: 'http:' }));
			history.record(createLog({ protocol: 'https:' }));

			expect(history.filterCalls({ protocol: 'https:' })).toHaveLength(1);
		});

		it('should filter by host in object criteria', () => {
			const history = new MockCallHistory();
			history.record(createLog({ host: 'localhost:8787' }));
			history.record(createLog({ host: 'api.example.com' }));

			expect(history.filterCalls({ host: 'api.example.com' })).toHaveLength(1);
		});

		it('should filter by port in object criteria', () => {
			const history = new MockCallHistory();
			history.record(createLog({ port: '8787' }));
			history.record(createLog({ port: '3000' }));

			expect(history.filterCalls({ port: '3000' })).toHaveLength(1);
		});

		it('should filter by hash in object criteria', () => {
			const history = new MockCallHistory();
			history.record(createLog({ hash: '' }));
			history.record(createLog({ hash: '#section' }));

			expect(history.filterCalls({ hash: '#section' })).toHaveLength(1);
		});

		it('should filter by fullUrl in object criteria', () => {
			const history = new MockCallHistory();
			history.record(createLog({ fullUrl: 'http://localhost:8787/api/posts' }));
			history.record(createLog({ fullUrl: 'http://localhost:8787/api/users' }));

			expect(history.filterCalls({ fullUrl: 'http://localhost:8787/api/users' })).toHaveLength(1);
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

	describe('toMap()', () => {
		it('should return Map with all log properties', () => {
			const history = new MockCallHistory();
			history.record(createLog({ method: 'POST', path: '/posts', body: '{"x":1}' }));

			const map = history.lastCall()?.toMap();

			expect(map).toBeInstanceOf(Map);
			expect(map.get('method')).toBe('POST');
			expect(map.get('path')).toBe('/posts');
			expect(map.get('body')).toBe('{"x":1}');
			expect(map.get('protocol')).toBe('http:');
			expect(map.get('host')).toBe('localhost:8787');
		});
	});

	describe('toString()', () => {
		it('should return pipe-delimited key->value string', () => {
			const history = new MockCallHistory();
			history.record(createLog({ method: 'GET', path: '/posts', protocol: 'https:' }));

			const str = history.lastCall()?.toString();

			expect(str).toContain('method->GET');
			expect(str).toContain('path->/posts');
			expect(str).toContain('protocol->https:');
			expect(str).toMatch(/\|/);
		});

		it('should be used by RegExp filterCalls with pipe-delimited format', () => {
			const history = new MockCallHistory();
			history.record(createLog({ protocol: 'http:' }));
			history.record(createLog({ protocol: 'https:' }));

			const result = history.filterCalls(/protocol->https:/);

			expect(result).toHaveLength(1);
			expect(result[0].protocol).toBe('https:');
		});
	});

	describe('filterCallsByProtocol', () => {
		it('should filter by protocol string', () => {
			const history = new MockCallHistory();
			history.record(createLog({ protocol: 'http:' }));
			history.record(createLog({ protocol: 'https:' }));

			expect(history.filterCallsByProtocol('https:')).toHaveLength(1);
		});

		it('should filter by protocol RegExp', () => {
			const history = new MockCallHistory();
			history.record(createLog({ protocol: 'http:' }));
			history.record(createLog({ protocol: 'https:' }));

			expect(history.filterCallsByProtocol(/https/)).toHaveLength(1);
		});
	});

	describe('filterCallsByHost', () => {
		it('should filter by host string', () => {
			const history = new MockCallHistory();
			history.record(createLog({ host: 'localhost:8787' }));
			history.record(createLog({ host: 'api.example.com' }));

			expect(history.filterCallsByHost('api.example.com')).toHaveLength(1);
		});

		it('should filter by host RegExp', () => {
			const history = new MockCallHistory();
			history.record(createLog({ host: 'localhost:8787' }));
			history.record(createLog({ host: 'api.example.com' }));

			expect(history.filterCallsByHost(/example/)).toHaveLength(1);
		});
	});

	describe('filterCallsByPort', () => {
		it('should filter by port string', () => {
			const history = new MockCallHistory();
			history.record(createLog({ port: '8787' }));
			history.record(createLog({ port: '3000' }));

			expect(history.filterCallsByPort('3000')).toHaveLength(1);
		});

		it('should filter by port RegExp', () => {
			const history = new MockCallHistory();
			history.record(createLog({ port: '8787' }));
			history.record(createLog({ port: '8080' }));

			expect(history.filterCallsByPort(/^80/)).toHaveLength(1);
		});
	});

	describe('filterCallsByHash', () => {
		it('should filter by hash string', () => {
			const history = new MockCallHistory();
			history.record(createLog({ hash: '' }));
			history.record(createLog({ hash: '#top' }));

			expect(history.filterCallsByHash('#top')).toHaveLength(1);
		});

		it('should filter by hash RegExp', () => {
			const history = new MockCallHistory();
			history.record(createLog({ hash: '#top' }));
			history.record(createLog({ hash: '#section-2' }));

			expect(history.filterCallsByHash(/section/)).toHaveLength(1);
		});
	});

	describe('filterCallsByFullUrl', () => {
		it('should filter by fullUrl string', () => {
			const history = new MockCallHistory();
			history.record(createLog({ fullUrl: 'http://localhost:8787/api/posts' }));
			history.record(createLog({ fullUrl: 'http://localhost:8787/api/users' }));

			expect(history.filterCallsByFullUrl('http://localhost:8787/api/users')).toHaveLength(1);
		});

		it('should filter by fullUrl RegExp', () => {
			const history = new MockCallHistory();
			history.record(createLog({ fullUrl: 'http://localhost:8787/api/posts' }));
			history.record(createLog({ fullUrl: 'http://localhost:8787/api/users' }));

			expect(history.filterCallsByFullUrl(/posts/)).toHaveLength(1);
		});
	});
});
