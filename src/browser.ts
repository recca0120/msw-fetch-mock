import { FetchMock } from './fetch-mock';
import { BrowserMswAdapter } from './browser-adapter';
import { HandlerFactory } from './handler-factory';
import type { SetupWorkerLike } from './types';

export { FetchMock } from './fetch-mock';
export { BrowserMswAdapter } from './browser-adapter';

/** Register MSW http handler factory. */
FetchMock._handlerFactory = HandlerFactory;

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
