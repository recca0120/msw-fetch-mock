export function formatUnhandledRequestWarning(method: string, url: string): string {
	return `[msw-fetch-mock] Warning: intercepted a request without a matching request handler:\n\n  \u2022 ${method} ${url}\n\nIf you still wish to intercept this unhandled request, please create a request handler for it.`;
}

export function formatUnhandledRequestError(method: string, url: string): string {
	return `[msw-fetch-mock] Cannot bypass a request when using the "error" strategy for the "onUnhandledRequest" option.\n\n  \u2022 ${method} ${url}\n`;
}
