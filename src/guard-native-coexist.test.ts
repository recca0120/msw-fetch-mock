import { describe, expect, it } from 'vitest';
import { createFetchMock as createNativeFetchMock } from './native';
import { createFetchMock as createNodeFetchMock } from './node';

describe('[AC-2] duplicate-server guard vs native mode', () => {
	it('a standalone /node fetchMock can activate while a /native one is active', async () => {
		// The native interceptor patches globalThis.fetch too, but it is not an MSW
		// server, so it must not be reported as "Another MSW server is already active".
		const native = createNativeFetchMock();
		await native.activate();
		try {
			const node = createNodeFetchMock();
			await expect(node.activate()).resolves.toBeUndefined();
			await node.deactivate();
		} finally {
			await native.deactivate();
		}
	});
});
