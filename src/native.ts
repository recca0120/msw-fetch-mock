import { FetchMock } from './fetch-mock';
import { NativeFetchAdapter } from './native-adapter';
import { NativeHandlerFactory } from './native-handler-factory';

export { FetchMock } from './fetch-mock';
export { NativeFetchAdapter } from './native-adapter';
export { NativeHandlerFactory } from './native-handler-factory';

/** Register native as the default adapter environment so `new FetchMock()` works. */
FetchMock._defaultAdapterFactory = () => new NativeFetchAdapter();

/** Register native handler factory. */
FetchMock._handlerFactory = NativeHandlerFactory;

export function createFetchMock(): FetchMock {
	return new FetchMock(new NativeFetchAdapter());
}

/** Pre-built singleton for quick standalone use. */
export const fetchMock = createFetchMock();

export * from './exports';
