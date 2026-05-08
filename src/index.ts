import { FetchMock } from './fetch-mock';
import { registerDefaultInterceptor } from './register-default-interceptor';

await registerDefaultInterceptor();

export function createFetchMock(): FetchMock {
	return new FetchMock();
}

export const fetchMock: FetchMock = createFetchMock();

export * from './exports';
