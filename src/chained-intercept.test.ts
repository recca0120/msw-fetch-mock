import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fetchMock } from './node';

describe('chained intercept', () => {
	beforeAll(async () => {
		await fetchMock.activate();
		fetchMock.disableNetConnect();
	});

	afterEach(() => {
		fetchMock.reset();
	});

	afterAll(() => {
		fetchMock.deactivate();
	});

	it('should support chained intercept after reply', async () => {
		// Given: fetchMock is activated
		// When: chain two intercepts
		fetchMock
			.get('http://example.com')
			.intercept({ path: '/test' })
			.reply(200, { call: 'first' })
			.intercept({ path: '/test' })
			.reply(200, { call: 'second' });

		// Then: both interceptors are registered in FIFO order
		const res1 = await fetch('http://example.com/test');
		const res2 = await fetch('http://example.com/test');

		expect((await res1.json()).call).toBe('first');
		expect((await res2.json()).call).toBe('second');
	});
});
