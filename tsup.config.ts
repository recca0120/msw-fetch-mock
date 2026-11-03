import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    node: 'src/node.ts',
    browser: 'src/browser.ts',
    legacy: 'src/legacy.ts',
    native: 'src/native.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['msw', 'msw/node', 'msw/browser'],
  splitting: true,
});
