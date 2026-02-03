import { FetchMock } from './fetch-mock';
import { NodeMswAdapter } from './node-adapter';
import { HandlerFactory } from './handler-factory';
import type { SetupServerLike } from './types';

export { FetchMock } from './fetch-mock';
export { NodeMswAdapter } from './node-adapter';

/** Register Node.js as the default adapter environment so `new FetchMock()` works. */
FetchMock._defaultAdapterFactory = () => new NodeMswAdapter();

/** Register MSW http handler factory. */
FetchMock._handlerFactory = HandlerFactory;

export function createFetchMock(server?: SetupServerLike): FetchMock {
  return new FetchMock(new NodeMswAdapter(server));
}

/** Pre-built singleton for quick standalone use (Cloudflare migration compatible). */
export const fetchMock = createFetchMock();

export type { SetupServerLike } from './types';
export { MockCallHistory, MockCallHistoryLog } from './exports';
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
  HandlerFactory,
  MockCallHistoryLogData,
  CallHistoryFilterCriteria,
} from './exports';
