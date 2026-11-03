import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { createFetchMock, fetchMock } from './index';
// Evaluated after ./index: the native entry overwrites the process-wide defaults.
import './native';

/** GET via node:http — only MSW intercepts it (native mode patches fetch() only). */
function httpGet(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		// read http.get at call time: MSW patches it on the module object
		http
			.get(url, (res) => {
				let body = '';
				res.on('data', (chunk) => {
					body += chunk;
				});
				res.on('end', () => resolve(body));
			})
			.on('error', reject);
	});
}

async function httpGetThroughMock(fm: ReturnType<typeof createFetchMock>): Promise<string> {
	await fm.activate();
	try {
		fm.get('http://isolation.test').intercept({ path: '/ping' }).reply(200, 'mocked');
		return await httpGet('http://isolation.test/ping');
	} finally {
		fm.deactivate();
	}
}

describe('[ENTRY] importing msw-fetch-mock/native after msw-fetch-mock (auto-detect)', () => {
	// MSW is installed, so the index entry detects MSW mode; a later native import
	// must not switch it (observable: node:http requests are still intercepted).
	it('createFetchMock() from the index entry keeps the detected MSW mode', async () => {
		expect(await httpGetThroughMock(createFetchMock())).toBe('mocked');
	});

	it('the fetchMock singleton from the index entry keeps the detected MSW mode', async () => {
		expect(await httpGetThroughMock(fetchMock)).toBe('mocked');
	});
});
