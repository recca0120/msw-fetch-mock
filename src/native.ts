import { FetchMock } from './fetch-mock';
import { NativeHandlerFactory } from './native-handler-factory';
import { NativeFetchInterceptor } from './native-interceptor';

export { NativeHandlerFactory } from './native-handler-factory';
export { NativeFetchInterceptor } from './native-interceptor';

/** Register native as the default interceptor so `new FetchMock()` works. */
FetchMock._defaultInterceptorFactory = () => new NativeFetchInterceptor();

/** Register native handler factory. */
FetchMock._handlerFactory = NativeHandlerFactory;

export function createFetchMock(): FetchMock {
  // Pass the handler factory explicitly: the statics above are process-wide and
  // another entry imported later (e.g. /node) would overwrite them.
  return new FetchMock(new NativeFetchInterceptor(), NativeHandlerFactory);
}

/** Pre-built singleton for quick standalone use. */
export const fetchMock: FetchMock = createFetchMock();

export * from './exports';
