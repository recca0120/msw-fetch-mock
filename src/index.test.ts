import { describe, expect, it } from 'vitest';

describe('index entry point', () => {
	it('should export FetchMock', async () => {
		const mod = await import('./index');
		expect(mod.FetchMock).toBeDefined();
	});

	it('should export createFetchMock', async () => {
		const mod = await import('./index');
		expect(typeof mod.createFetchMock).toBe('function');
	});

	it('should export fetchMock singleton', async () => {
		const mod = await import('./index');
		expect(mod.fetchMock).toBeDefined();
	});

	it('should export MockCallHistory', async () => {
		const mod = await import('./index');
		expect(mod.MockCallHistory).toBeDefined();
	});
});
