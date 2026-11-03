import { BrowserFetchInterceptor } from './browser-interceptor';
import { FetchMock } from './fetch-mock';
import { HandlerFactory } from './handler-factory';
import { type SetupWorkerLike } from './types';

export { BrowserFetchInterceptor } from './browser-interceptor';

/** Register MSW http handler factory. */
FetchMock._handlerFactory = HandlerFactory;

export function createFetchMock(worker: SetupWorkerLike): FetchMock {
	// Pass the handler factory explicitly: the static above is process-wide.
	return new FetchMock(new BrowserFetchInterceptor(worker), HandlerFactory);
}

export * from './exports';
export type { SetupWorkerLike } from './types';
