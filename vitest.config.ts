import { defineConfig } from 'vitest/config';

// The same suite runs against each supported MSW major.
// `msw3` is a pnpm alias (`npm:msw@^3`); MSW v3 requires Node >= 22.12.
// MSW_MAJOR tells src/msw-version.test.ts which major each project must load.
const [major, minor] = process.versions.node.split('.').map(Number);
const supportsMsw3 = major > 22 || (major === 22 && minor >= 12);
if (!supportsMsw3) {
  console.warn(
    `[vitest] Skipping the msw3 project: MSW v3 needs Node >= 22.12 (running ${process.version}).`,
  );
}

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'msw2', env: { MSW_MAJOR: '2' } },
      },
      ...(supportsMsw3
        ? [
            {
              extends: true,
              test: { name: 'msw3', env: { MSW_MAJOR: '3' } },
              resolve: {
                alias: [{ find: /^msw(\/.*)?$/, replacement: 'msw3$1' }],
              },
            },
          ]
        : []),
    ],
  },
});
