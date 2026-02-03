/**
 * Shared re-exports used by all entry points (node, browser, native, index).
 *
 * Entry-point-specific exports (e.g. NodeMswAdapter, BrowserMswAdapter,
 * NativeFetchAdapter) are exported directly from their respective entry files.
 */

export { FetchMock } from './fetch-mock';
export { MockCallHistory, MockCallHistoryLog } from './mock-call-history';

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
} from './types';
export type { MockCallHistoryLogData, CallHistoryFilterCriteria } from './mock-call-history';
