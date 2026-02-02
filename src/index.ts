import { FetchMock } from './mock-server';

export { createFetchMock, FetchMock } from './mock-server';

/** Pre-built singleton for quick standalone use (Cloudflare migration compatible). */
export const fetchMock = new FetchMock();
export type {
  InterceptOptions,
  MockPool,
  MockInterceptor,
  MockReplyChain,
  ReplyOptions,
  PendingInterceptor,
} from './mock-server';
export { MockCallHistory, MockCallHistoryLog } from './mock-call-history';
export type { MockCallHistoryLogData, CallHistoryFilterCriteria } from './mock-call-history';
