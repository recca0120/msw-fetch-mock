import { BrowserFetchInterceptor } from './browser-interceptor';
import { ServerFetchInterceptor } from './server-interceptor';
import { isFetchInterceptor, isSetupServerLike, isSetupWorkerLike } from './type-guards';
import { type FetchInterceptor, type SetupServerLike, type SetupWorkerLike } from './types';

/**
 * Turns what was passed to `new FetchMock(input)` into a FetchInterceptor.
 * A FetchInterceptor is checked first, since it may also look like a server/worker.
 */
export function resolveInterceptor(
	input: SetupServerLike | SetupWorkerLike | FetchInterceptor | undefined,
	defaultInterceptorFactory: (() => FetchInterceptor) | undefined,
): FetchInterceptor {
	if (!input) {
		if (!defaultInterceptorFactory) {
			throw new Error(
				'FetchMock requires a server, worker, or interceptor argument. ' +
					'Use createFetchMock() from msw-fetch-mock/node or msw-fetch-mock/browser, ' +
					'or pass a setupServer/setupWorker instance directly.',
			);
		}
		return defaultInterceptorFactory();
	}
	if (isFetchInterceptor(input)) return input;
	// new FetchMock(server): fetchMock starts and stops the server
	if (isSetupServerLike(input)) return new ServerFetchInterceptor(input, { manageLifecycle: true });
	if (isSetupWorkerLike(input)) return new BrowserFetchInterceptor(input);
	throw new Error(
		'Invalid argument: expected a setupServer, setupWorker, or FetchInterceptor instance.',
	);
}
