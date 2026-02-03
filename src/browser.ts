import { FetchMock } from './fetch-mock';
import { BrowserMswAdapter } from './browser-adapter';
import type { SetupWorkerLike } from './types';

export { FetchMock } from './fetch-mock';
export { BrowserMswAdapter } from './browser-adapter';

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
} from './types';
export { MockCallHistory, MockCallHistoryLog } from './mock-call-history';
export type { MockCallHistoryLogData, CallHistoryFilterCriteria } from './mock-call-history';
