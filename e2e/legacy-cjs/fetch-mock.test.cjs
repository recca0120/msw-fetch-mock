const { describe, it, expect, beforeAll, afterEach, afterAll } = require('@jest/globals');
const { rest } = require('msw');
const { setupServer } = require('msw/node');
const { defineScenarios, jestAssert } = require('../shared/scenarios.cjs');

const API_BASE = 'http://localhost:8787';

const { getFetchMock } = defineScenarios({
  label: 'legacy-cjs integration (MSW v1)',
  runner: { describe, it, before: beforeAll, after: afterAll, afterEach },
  assert: jestAssert(expect),
  exclusiveActivation: false,
  createFetchMock: async () => {
    const { createFetchMock } = await import('msw-fetch-mock/legacy');
    return createFetchMock(rest, setupServer());
  },
});

// Legacy-only: MSW v1 responses cannot stream, so the body is buffered first.
describe('[BUG-1] streaming body', () => {
  it('should stream response body when reply body is a ReadableStream', async () => {
    const chunks = ['hello', ' ', 'world'];
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    getFetchMock().get(API_BASE).intercept({ path: '/stream', method: 'GET' }).reply(200, stream);

    const response = await fetch(`${API_BASE}/stream`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello world');
  });
});
