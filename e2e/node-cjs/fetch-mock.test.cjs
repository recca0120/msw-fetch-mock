const { describe, it, before, afterEach, after } = require('node:test');
const { createFetchMock } = require('msw-fetch-mock/node');
const { defineScenarios } = require('../shared/scenarios.cjs');

defineScenarios({
	label: 'node-cjs integration (require)',
	runner: { describe, it, before, after, afterEach },
	createFetchMock: () => createFetchMock(),
});
