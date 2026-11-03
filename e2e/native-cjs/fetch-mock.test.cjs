const { describe, it, before, afterEach, after } = require('node:test');
const { createFetchMock } = require('msw-fetch-mock/native');
const { defineScenarios } = require('../shared/scenarios.cjs');

defineScenarios({
	label: 'native-cjs integration (require)',
	runner: { describe, it, before, after, afterEach },
	createFetchMock: () => createFetchMock(),
});
