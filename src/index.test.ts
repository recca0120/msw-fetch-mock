import { describe, expect, it } from 'vitest';

describe('index entry point', () => {
  it('should export FetchMock, createFetchMock, the fetchMock singleton and MockCallHistory', async () => {
    const mod = await import('./index');

    expect(mod).toMatchObject({
      FetchMock: expect.any(Function),
      createFetchMock: expect.any(Function),
      MockCallHistory: expect.any(Function),
    });
    expect(mod.fetchMock).toBeInstanceOf(mod.FetchMock);
  });
});
