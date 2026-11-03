import { type FetchInterceptor, type SetupServerLike, type SetupWorkerLike } from './types';

/** True when `input` is a non-null object whose given members are all functions. */
function hasMethods(input: unknown, ...names: string[]): boolean {
	return (
		typeof input === 'object' &&
		input !== null &&
		names.every((name) => typeof (input as Record<string, unknown>)[name] === 'function')
	);
}

export function isSetupServerLike(input: unknown): input is SetupServerLike {
	return hasMethods(input, 'listen', 'close');
}

export function isSetupWorkerLike(input: unknown): input is SetupWorkerLike {
	return hasMethods(input, 'start', 'stop');
}

export function isFetchInterceptor(input: unknown): input is FetchInterceptor {
	return hasMethods(input, 'activate', 'deactivate');
}
