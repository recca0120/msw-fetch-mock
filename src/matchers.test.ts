import { describe, expect, it } from 'vitest';
import {
	escapeRegExp,
	isPending,
	matchBody,
	matchesValue,
	matchHeaders,
	matchPath,
	matchQuery,
	recordCall,
} from './matchers';
import { MockCallHistory } from './mock-call-history';
import { type PendingInterceptor } from './types';

function createPending(overrides: Partial<PendingInterceptor> = {}): PendingInterceptor {
	return {
		origin: 'http://localhost',
		path: '/test',
		method: 'GET',
		consumed: false,
		times: 1,
		timesInvoked: 0,
		persist: false,
		...overrides,
	};
}

describe('isPending', () => {
	it('should return true when timesInvoked < times', () => {
		expect(isPending(createPending({ times: 2, timesInvoked: 1 }))).toBe(true);
	});

	it('should return false when timesInvoked >= times', () => {
		expect(isPending(createPending({ times: 1, timesInvoked: 1 }))).toBe(false);
	});

	it('should return true for persist when timesInvoked is 0', () => {
		expect(isPending(createPending({ persist: true, timesInvoked: 0 }))).toBe(true);
	});

	it('should return false for persist when timesInvoked > 0', () => {
		expect(isPending(createPending({ persist: true, timesInvoked: 1 }))).toBe(false);
	});
});

describe('escapeRegExp', () => {
	it('should escape special regex characters', () => {
		expect(escapeRegExp('http://example.com/api?q=1&b=2')).toBe(
			'http://example\\.com/api\\?q=1&b=2',
		);
	});

	it('should escape all special chars', () => {
		const specialChars = ['.*+?^', '$', '{}()|[]\\'];
		const input = specialChars.join('');
		expect(escapeRegExp(input)).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
	});

	it('should return plain string unchanged', () => {
		expect(escapeRegExp('hello')).toBe('hello');
	});
});

describe('matchesValue', () => {
	it('should match exact string', () => {
		expect(matchesValue('/api', '/api')).toBe(true);
	});

	it('should not match different string', () => {
		expect(matchesValue('/api', '/other')).toBe(false);
	});

	it('should match RegExp', () => {
		expect(matchesValue('/api/users', /^\/api/)).toBe(true);
	});

	it('should not match non-matching RegExp', () => {
		expect(matchesValue('/other', /^\/api/)).toBe(false);
	});

	it('should match using function matcher', () => {
		expect(matchesValue('/api', (v) => v.startsWith('/api'))).toBe(true);
	});

	it('should not match when function returns false', () => {
		expect(matchesValue('/other', (v) => v.startsWith('/api'))).toBe(false);
	});
});

describe('matchPath', () => {
	it('should return true for string path (matched by MSW URL pattern)', () => {
		const request = new Request('http://localhost/api/users');
		expect(matchPath(request, 'http://localhost', '/api/users')).toBe(true);
	});

	it('should match RegExp path against relative path', () => {
		const request = new Request('http://localhost/api/users');
		expect(matchPath(request, 'http://localhost', /^\/api/)).toBe(true);
	});

	it('should not match non-matching RegExp path', () => {
		const request = new Request('http://localhost/other');
		expect(matchPath(request, 'http://localhost', /^\/api/)).toBe(false);
	});

	it('should match function path matcher', () => {
		const request = new Request('http://localhost/api/users');
		expect(matchPath(request, 'http://localhost', (p) => p.startsWith('/api'))).toBe(true);
	});

	it('should strip origin prefix from path', () => {
		const request = new Request('http://localhost/prefix/api/users');
		expect(matchPath(request, 'http://localhost/prefix', /^\/api/)).toBe(true);
	});

	it('should include query string in path matching', () => {
		const request = new Request('http://localhost/api?q=1');
		expect(matchPath(request, 'http://localhost', /\/api\?q=1/)).toBe(true);
	});
});

describe('matchQuery', () => {
	it('should return true when no query criteria', () => {
		const request = new Request('http://localhost/api');
		expect(matchQuery(request)).toBe(true);
	});

	it('should return true when query criteria is undefined', () => {
		const request = new Request('http://localhost/api');
		expect(matchQuery(request, undefined)).toBe(true);
	});

	it('should match query parameters', () => {
		const request = new Request('http://localhost/api?page=1&limit=10');
		expect(matchQuery(request, { page: '1', limit: '10' })).toBe(true);
	});

	it('should not match when query param is missing', () => {
		const request = new Request('http://localhost/api?page=1');
		expect(matchQuery(request, { page: '1', limit: '10' })).toBe(false);
	});

	it('should not match when query param value differs', () => {
		const request = new Request('http://localhost/api?page=2');
		expect(matchQuery(request, { page: '1' })).toBe(false);
	});
});

describe('matchHeaders', () => {
	it('should return true when no header criteria', () => {
		const request = new Request('http://localhost/api');
		expect(matchHeaders(request)).toBe(true);
	});

	it('should match exact header value', () => {
		const request = new Request('http://localhost/api', {
			headers: { 'Content-Type': 'application/json' },
		});
		expect(matchHeaders(request, { 'Content-Type': 'application/json' })).toBe(true);
	});

	it('should match header with RegExp', () => {
		const request = new Request('http://localhost/api', {
			headers: { 'Content-Type': 'application/json' },
		});
		expect(matchHeaders(request, { 'Content-Type': /json/ })).toBe(true);
	});

	it('should match header with function', () => {
		const request = new Request('http://localhost/api', {
			headers: { Authorization: 'Bearer token123' },
		});
		expect(matchHeaders(request, { Authorization: (v) => v.startsWith('Bearer ') })).toBe(true);
	});

	it('should not match when header is missing', () => {
		const request = new Request('http://localhost/api');
		expect(matchHeaders(request, { 'X-Custom': 'value' })).toBe(false);
	});

	it('should not match when header value differs', () => {
		const request = new Request('http://localhost/api', {
			headers: { 'Content-Type': 'text/plain' },
		});
		expect(matchHeaders(request, { 'Content-Type': 'application/json' })).toBe(false);
	});
});

describe('matchBody', () => {
	it('should return true when no body matcher', () => {
		expect(matchBody('anything')).toBe(true);
	});

	it('should match exact body string', () => {
		expect(matchBody('{"key":"value"}', '{"key":"value"}')).toBe(true);
	});

	it('should not match different body', () => {
		expect(matchBody('{"key":"other"}', '{"key":"value"}')).toBe(false);
	});

	it('should match body with RegExp', () => {
		expect(matchBody('{"key":"value"}', /key/)).toBe(true);
	});

	it('should match body with function', () => {
		expect(matchBody('hello', (v) => v.length > 0)).toBe(true);
	});

	it('should treat null body as empty string', () => {
		expect(matchBody(null, '')).toBe(true);
	});

	it('should not match null body against non-empty matcher', () => {
		expect(matchBody(null, 'something')).toBe(false);
	});
});

describe('recordCall', () => {
	it('should record request details into call history', () => {
		const history = new MockCallHistory();
		const request = new Request('http://localhost:3000/api/users?page=1#section', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{"key":"value"}',
		});

		recordCall(history, request, '{"key":"value"}');

		expect(history.length).toBe(1);
		const call = history.firstCall()!;
		expect(call.body).toBe('{"key":"value"}');
		expect(call.method).toBe('POST');
		expect(call.path).toBe('/api/users');
		expect(call.origin).toBe('http://localhost:3000');
		expect(call.host).toBe('localhost:3000');
		expect(call.protocol).toBe('http:');
		expect(call.port).toBe('3000');
		expect(call.searchParams).toEqual({ page: '1' });
		expect(call.headers['content-type']).toBe('application/json');
	});

	it('should record null body', () => {
		const history = new MockCallHistory();
		const request = new Request('http://localhost/api');

		recordCall(history, request, null);

		expect(history.firstCall()?.body).toBeNull();
	});
});
