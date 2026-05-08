import { FetchMock } from './fetch-mock';
import { NativeHandlerFactory } from './native-handler-factory';
import { NativeFetchInterceptor } from './native-interceptor';

export { FetchMock } from './fetch-mock';
export { NativeHandlerFactory } from './native-handler-factory';
export { NativeFetchInterceptor } from './native-interceptor';

/** Register native as the default interceptor so `new FetchMock()` works. */
FetchMock._defaultInterceptorFactory = () => new NativeFetchInterceptor();

/** Register native handler factory. */
FetchMock._handlerFactory = NativeHandlerFactory;

export function createFetchMock(): FetchMock {
	return new FetchMock(new NativeFetchInterceptor());
}

/** Pre-built singleton for quick standalone use. */
export const fetchMock: FetchMock = createFetchMock();

export * from './exports';
