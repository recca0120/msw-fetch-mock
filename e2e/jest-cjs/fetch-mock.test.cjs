const { describe, it, expect, beforeAll, afterEach, afterAll } = require('@jest/globals');
const { defineScenarios, jestAssert } = require('../shared/scenarios.cjs');

defineScenarios({
	label: 'jest-cjs integration (dynamic import)',
	runner: { describe, it, before: beforeAll, after: afterAll, afterEach },
	assert: jestAssert(expect),
	// the default entry uses top-level await, so CommonJS loads it with import()
	createFetchMock: async () => (await import('msw-fetch-mock')).createFetchMock(),
});
