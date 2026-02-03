import { FetchMock } from './fetch-mock';
import { NodeMswAdapter } from './node-adapter';
import type { SetupServerLike } from './types';

export { FetchMock } from './fetch-mock';
export { NodeMswAdapter } from './node-adapter';

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
  PendingInterceptor,
  MswAdapter,
  SetupServerLike,
} from './types';
export { MockCallHistory, MockCallHistoryLog } from './mock-call-history';
export type { MockCallHistoryLogData, CallHistoryFilterCriteria } from './mock-call-history';
