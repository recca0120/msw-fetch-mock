import { FetchMock } from './fetch-mock';
import { NodeMswAdapter } from './node-adapter';
import { createLegacyHandlerFactory, type LegacyRestApi } from './legacy-handler-factory';
import { isSetupServerLike } from './type-guards';
import type { SetupServerLike } from './types';

export { FetchMock } from './fetch-mock';
export { createLegacyHandlerFactory } from './legacy-handler-factory';
export type { LegacyRestApi } from './legacy-handler-factory';

/** Register Node.js adapter resolver for legacy mode. */
FetchMock._adapterResolver = (input?: unknown) => {
  if (!input) return new NodeMswAdapter();
  if (isSetupServerLike(input)) return new NodeMswAdapter(input, { manageLifecycle: true });
  return undefined;
};

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
 * @param server - Optional MSW v1 setupServer instance. If omitted, you must pass a
 *   server or adapter to `new FetchMock(server)` yourself.
 */
export function createFetchMock(rest: LegacyRestApi, server?: SetupServerLike): FetchMock {
  FetchMock._handlerFactory = createLegacyHandlerFactory(rest);
  if (server) {
    return new FetchMock(server);
  }
  return new FetchMock();
}

export type {
  ActivateOptions,
  OnUnhandledRequest,
  InterceptOptions,
  MockPool,
  MockInterceptor,
  MockReplyChain,
  ReplyOptions,
  PendingInterceptor,
  MswAdapter,
  SetupServerLike,
  HandlerFactory,
} from './types';
export { MockCallHistory, MockCallHistoryLog } from './mock-call-history';
export type { MockCallHistoryLogData, CallHistoryFilterCriteria } from './mock-call-history';
