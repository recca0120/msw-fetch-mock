import { describe, expect, it } from 'vitest';
import { createFetchMock, fetchMock } from './node';
// Evaluated after ./node: the native entry overwrites the process-wide defaults.
import './native';

/** Activates `fm`, mocks one route and returns what fetch() got. */
async function fetchThroughMock(fm: ReturnType<typeof createFetchMock>): Promise<string> {
  await fm.activate();
  try {
    fm.get('http://isolation.test').intercept({ path: '/ping' }).reply(200, 'mocked');
    const response = await fetch('http://isolation.test/ping');
    return await response.text();
  } finally {
    fm.deactivate();
  }
}

describe('[ENTRY] importing msw-fetch-mock/native after msw-fetch-mock/node', () => {
  it('createFetchMock() from /node still mocks through MSW', async () => {
    expect(await fetchThroughMock(createFetchMock())).toBe('mocked');
  });

  it('the fetchMock singleton from /node still mocks through MSW', async () => {
    expect(await fetchThroughMock(fetchMock)).toBe('mocked');
  });
});
