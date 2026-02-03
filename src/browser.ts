import { FetchMock } from './fetch-mock';
import { BrowserMswAdapter } from './browser-adapter';
import { v2HandlerFactory } from './v2-handler-factory';
import type { SetupWorkerLike } from './types';

export { FetchMock } from './fetch-mock';
export { BrowserMswAdapter } from './browser-adapter';

/** Register MSW v2 handler factory. */
FetchMock._handlerFactory = v2HandlerFactory;

export function createFetchMock(worker: SetupWorkerLike): FetchMock {
  return new FetchMock(new BrowserMswAdapter(worker));
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
  SetupWorkerLike,
  HandlerFactory,
} from './types';
export { MockCallHistory, MockCallHistoryLog } from './mock-call-history';
export type { MockCallHistoryLogData, CallHistoryFilterCriteria } from './mock-call-history';
