import { FetchMock } from './fetch-mock';
import { NodeMswAdapter } from './node-adapter';
import { BrowserMswAdapter } from './browser-adapter';
import { v2HandlerFactory } from './v2-handler-factory';
import { isSetupServerLike, isSetupWorkerLike } from './type-guards';
import type { SetupServerLike } from './types';

export { FetchMock } from './fetch-mock';
export { NodeMswAdapter } from './node-adapter';

/** Register Node.js adapter resolver: handles SetupServerLike, SetupWorkerLike, and no-arg standalone mode. */
FetchMock._adapterResolver = (input?: unknown) => {
  if (!input) return new NodeMswAdapter();
  if (isSetupServerLike(input)) return new NodeMswAdapter(input, { manageLifecycle: true });
  if (isSetupWorkerLike(input)) return new BrowserMswAdapter(input);
  return undefined;
};

/** Register MSW v2 handler factory. */
FetchMock._handlerFactory = v2HandlerFactory;

export function createFetchMock(server?: SetupServerLike): FetchMock {
  return new FetchMock(new NodeMswAdapter(server));
}

/** Pre-built singleton for quick standalone use (Cloudflare migration compatible). */
export const fetchMock = createFetchMock();

export type {
  ActivateOptions,
  OnUnhandledRequest,
  InterceptOptions,
  MockPool,
  MockInterceptor,
  MockReplyChain,
  ReplyOptions,
  ReplyCallback,
  SingleReplyCallback,
  SingleReplyResult,
  PendingInterceptor,
  MswAdapter,
  SetupServerLike,
  HandlerFactory,
} from './types';
export { MockCallHistory, MockCallHistoryLog } from './mock-call-history';
export type { MockCallHistoryLogData, CallHistoryFilterCriteria } from './mock-call-history';
