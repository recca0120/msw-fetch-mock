import { after, afterEach, before, describe, it } from 'node:test';
import { createFetchMock } from 'msw-fetch-mock/node';
import { defineScenarios } from '../shared/scenarios.cjs';

defineScenarios({
  label: 'node-test integration',
  runner: { describe, it, before, after, afterEach },
  createFetchMock: () => createFetchMock(),
});
