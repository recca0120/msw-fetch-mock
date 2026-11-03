import { FetchMock } from './fetch-mock';
import { registerDefaultInterceptor } from './register-default-interceptor';

// Keep what was detected here: the process-wide defaults it also registers can be
// overwritten by another entry imported later.
const detected = await registerDefaultInterceptor();

export function createFetchMock(): FetchMock {
  return new FetchMock(detected.createInterceptor(), detected.handlerFactory);
}

export const fetchMock: FetchMock = createFetchMock();

export * from './exports';
