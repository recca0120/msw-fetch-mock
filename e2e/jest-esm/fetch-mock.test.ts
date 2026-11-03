import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { createFetchMock } from 'msw-fetch-mock';
import { defineScenarios, jestAssert } from '../shared/scenarios.cjs';

defineScenarios({
	label: 'jest-esm integration',
	runner: { describe, it, before: beforeAll, after: afterAll, afterEach },
	assert: jestAssert(expect),
	createFetchMock: () => createFetchMock(),
});
