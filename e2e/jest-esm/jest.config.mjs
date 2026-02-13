/** @type {import('jest').Config} */
export default {
	extensionsToTreatAsEsm: ['.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { useESM: true }],
	},
	testMatch: ['**/*.test.ts'],
};
