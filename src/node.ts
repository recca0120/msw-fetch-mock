import { FetchMock } from './fetch-mock';
import { HandlerFactory } from './handler-factory';
import { NodeFetchInterceptor } from './node-interceptor';
import { type SetupServerLike } from './types';

export { NodeFetchInterceptor } from './node-interceptor';

/** Register Node.js as the default interceptor so `new FetchMock()` works. */
FetchMock._defaultInterceptorFactory = () => new NodeFetchInterceptor();

/** Register MSW http handler factory. */
FetchMock._handlerFactory = HandlerFactory;

export function createFetchMock(server?: SetupServerLike): FetchMock {
  // Pass the handler factory explicitly: the statics above are process-wide and
  // another entry imported later (e.g. /native) would overwrite them.
  return new FetchMock(new NodeFetchInterceptor(server), HandlerFactory);
}

/** Pre-built singleton for quick standalone use (Cloudflare migration compatible). */
export const fetchMock: FetchMock = createFetchMock();

export * from './exports';
export type { SetupServerLike } from './types';
