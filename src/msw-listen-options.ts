import { type OnUnhandledRequestCallback } from './types';

/** Minimal shape of an MSW v3 network frame passed to `onUnhandledFrame`. */
interface UnhandledFrameArgs {
	frame: { data?: { request?: unknown } };
	defaults: { warn(): void; error(): void };
}

/**
 * Builds the unhandled-request options for `server.listen()` / `worker.start()`
 * that work across MSW majors: v1/v2 read `onUnhandledRequest`, v3 renamed it to
 * `onUnhandledFrame` with a `({ frame, defaults })` signature. Each version
 * ignores the key it does not know.
 */
export function toMswListenOptions(callback: OnUnhandledRequestCallback): Record<string, unknown> {
	return {
		onUnhandledRequest: callback,
		onUnhandledFrame: ({ frame, defaults }: UnhandledFrameArgs) => {
			// Only HTTP frames carry a Request; other protocols (e.g. WebSocket)
			// are outside msw-fetch-mock's scope and left untouched.
			const request = frame.data?.request;
			if (!(request instanceof Request)) return;
			callback(request, { warning: defaults.warn, error: defaults.error });
		},
	};
}
