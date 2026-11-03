import { FetchMock } from './fetch-mock';
import { createLegacyHandlerFactory, type LegacyRestApi } from './legacy-handler-factory';
import { type SetupServerLike } from './types';

export type { LegacyRestApi } from './legacy-handler-factory';
export { createLegacyHandlerFactory } from './legacy-handler-factory';

/**
 * Create a FetchMock instance for MSW v1 (legacy) environments.
 *
 * Usage with MSW v1:
 * ```ts
 * import { rest } from 'msw';
 * import { setupServer } from 'msw/node';
 * import { createFetchMock } from 'msw-fetch-mock/legacy';
 *
 * const server = setupServer();
 * const fetchMock = createFetchMock(rest, server);
 * ```
 *
 * @param rest - The `rest` object from MSW v1 (`import { rest } from 'msw'`)
 * @param server - The MSW v1 setupServer instance to intercept with. Required: without
 *   it there is nothing to intercept with (the parameter stays optional in the type only
 *   for compatibility). To bring your own interceptor, use
 *   `new FetchMock(interceptor, createLegacyHandlerFactory(rest))`.
 * @throws When `server` is omitted.
 */
export function createFetchMock(rest: LegacyRestApi, server?: SetupServerLike): FetchMock {
  if (!server) {
    // Never fall back to process-wide defaults: those are MSW v2 / native
    // interceptors registered by other entries and cannot run MSW v1 handlers.
    throw new Error(
      'createFetchMock(rest) from msw-fetch-mock/legacy requires an MSW v1 server: ' +
        'createFetchMock(rest, setupServer()).',
    );
  }
  return new FetchMock(server, createLegacyHandlerFactory(rest));
}

export * from './exports';
export type { SetupServerLike } from './types';
