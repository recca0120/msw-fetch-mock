import { defineConfig } from 'vitest/config';

// The same suite runs against each supported MSW major.
// `msw3` is a pnpm alias (`npm:msw@^3`); MSW v3 requires Node >= 22.12.
const [major, minor] = process.versions.node.split('.').map(Number);
const supportsMsw3 = major > 22 || (major === 22 && minor >= 12);

export default defineConfig({
	test: {
		globals: true,
		projects: [
			{
				extends: true,
				test: { name: 'msw2', include: ['src/**/*.test.ts'] },
			},
			...(supportsMsw3
				? [
						{
							extends: true,
							test: { name: 'msw3', include: ['src/**/*.test.ts'] },
							resolve: {
								alias: [{ find: /^msw(\/.*)?$/, replacement: 'msw3$1' }],
							},
						},
					]
				: []),
		],
	},
});
