import { BrowserMswAdapter } from './browser-adapter';
import { FetchMock } from './fetch-mock';
import { HandlerFactory } from './handler-factory';
import { type SetupWorkerLike } from './types';

export { BrowserMswAdapter } from './browser-adapter';
export { FetchMock } from './fetch-mock';

/** Register MSW http handler factory. */
FetchMock._handlerFactory = HandlerFactory;

export function createFetchMock(worker: SetupWorkerLike): FetchMock {
  return new FetchMock(new BrowserMswAdapter(worker));
}

export * from './exports';
export type { SetupWorkerLike } from './types';
