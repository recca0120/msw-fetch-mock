/**
 * Shared re-exports used by all entry points (node, browser, native, index).
 *
 * Entry-point-specific exports (e.g. NodeMswAdapter, BrowserMswAdapter,
 * NativeFetchAdapter) are exported directly from their respective entry files.
 */

export { FetchMock } from './fetch-mock';
export type { CallHistoryFilterCriteria, MockCallHistoryLogData } from './mock-call-history';
export { MockCallHistory, MockCallHistoryLog } from './mock-call-history';
export type {
  ActivateOptions,
  HandlerFactory,
  InterceptOptions,
  MockInterceptor,
  MockPool,
  MockReplyChain,
  MswAdapter,
  OnUnhandledRequest,
  PendingInterceptor,
  ReplyCallback,
  ReplyOptions,
  SingleReplyCallback,
  SingleReplyResult,
} from './types';
