import { after, afterEach, before, describe, it } from 'node:test';
import { createFetchMock } from 'msw-fetch-mock/native';
import { defineScenarios } from '../shared/scenarios.cjs';

defineScenarios({
	label: 'native-esm integration',
	runner: { describe, it, before, after, afterEach },
	createFetchMock: () => createFetchMock(),
});
