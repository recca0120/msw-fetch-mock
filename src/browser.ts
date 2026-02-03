import { FetchMock } from './fetch-mock';
import { BrowserMswAdapter } from './browser-adapter';
import { v2HandlerFactory } from './v2-handler-factory';
import { isSetupWorkerLike } from './type-guards';
import type { SetupWorkerLike } from './types';

export { FetchMock } from './fetch-mock';
export { BrowserMswAdapter } from './browser-adapter';

/** Register browser adapter resolver: handles SetupWorkerLike. */
FetchMock._adapterResolver = (input?: unknown) => {
  if (input && isSetupWorkerLike(input)) return new BrowserMswAdapter(input);
  return undefined;
};

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
