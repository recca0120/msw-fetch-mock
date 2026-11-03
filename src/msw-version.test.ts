import { setupServer } from 'msw/node';
import { describe, expect, it } from 'vitest';

// Guards the dual-version setup in vitest.config.ts: if the `msw` → `msw3` alias ever
// stopped applying, both projects would silently test MSW v2 and stay green.
describe('test setup', () => {
  it('loads the MSW major this project is meant to test', () => {
    // Only MSW v3's setupServer() exposes `readyState`.
    const loadedMajor = 'readyState' in setupServer() ? '3' : '2';

    expect(loadedMajor).toBe(process.env.MSW_MAJOR);
  });
});
