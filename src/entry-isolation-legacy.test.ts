import { describe, expect, it, vi } from 'vitest';
// Another entry registers process-wide defaults first (here: MSW v2 Node).
import './node';
import { createFetchMock, type LegacyRestApi } from './legacy';

const fakeRest = {
	get: vi.fn(),
	post: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
	patch: vi.fn(),
	all: vi.fn(),
} as unknown as LegacyRestApi;

describe('[ENTRY] msw-fetch-mock/legacy createFetchMock(rest) without a server', () => {
	it('throws a clear error even when another entry registered defaults', () => {
		// Without a server there is nothing MSW v1 can intercept with; silently
		// falling back to the MSW v2 Node interceptor does not work.
		expect(() => createFetchMock(fakeRest)).toThrow(/requires an MSW v1 server/);
	});
});
