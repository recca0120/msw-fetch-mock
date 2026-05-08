import { type MockCallHistory } from './mock-call-history';
import {
	type BodyMatcher,
	type HeaderValueMatcher,
	type PathMatcher,
	type PendingInterceptor,
} from './types';

export function isPending(p: PendingInterceptor): boolean {
	if (p.persist) return p.timesInvoked === 0;
	return p.timesInvoked < p.times;
}

export function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesValue(
	value: string,
	matcher: string | RegExp | ((v: string) => boolean),
): boolean {
	if (typeof matcher === 'string') return value === matcher;
	if (matcher instanceof RegExp) return matcher.test(value);
	return matcher(value);
}

function matchStringPathWithQuery(
	relativePathname: string,
	requestParams: URLSearchParams,
	matcherPath: string,
	matcherQuery: string,
): boolean {
	if (relativePathname !== matcherPath) return false;

	const matcherParams = new URLSearchParams(matcherQuery);

	for (const [key, value] of matcherParams.entries()) {
		if (requestParams.get(key) !== value) return false;
	}

	return Array.from(requestParams.keys()).length === Array.from(matcherParams.keys()).length;
}

export function matchPath(request: Request, origin: string, pathMatcher: PathMatcher): boolean {
	const url = new URL(request.url);
	const originUrl = new URL(origin);

	if (url.origin !== originUrl.origin) return false;

	const originPrefix = originUrl.pathname.replace(/\/$/, '');
	const strip = <T extends string>(s: T) =>
		s.startsWith(originPrefix) ? (s.slice(originPrefix.length) as T) : s;

	if (typeof pathMatcher !== 'string') {
		const relativePath = strip(url.pathname + url.search);
		return matchesValue(relativePath, pathMatcher);
	}

	const relativePathname = strip(url.pathname);

	if (!pathMatcher.includes('?')) {
		return relativePathname === pathMatcher;
	}

	const [matcherPath, matcherQuery] = pathMatcher.split('?') as [string, string];
	return matchStringPathWithQuery(relativePathname, url.searchParams, matcherPath, matcherQuery);
}

export function matchQuery(request: Request, query?: Record<string, string>): boolean {
	if (!query) return true;
	const url = new URL(request.url);
	for (const [key, value] of Object.entries(query)) {
		if (url.searchParams.get(key) !== value) return false;
	}
	return true;
}

export function matchHeaders(
	request: Request,
	headers?: Record<string, HeaderValueMatcher>,
): boolean {
	if (!headers) return true;
	for (const [key, matcher] of Object.entries(headers)) {
		const value = request.headers.get(key);
		if (value === null || !matchesValue(value, matcher)) return false;
	}
	return true;
}

export function matchBody(bodyText: string | null, bodyMatcher?: BodyMatcher): boolean {
	if (!bodyMatcher) return true;
	return matchesValue(bodyText ?? '', bodyMatcher);
}

export function recordCall(
	callHistory: MockCallHistory,
	request: Request,
	bodyText: string | null,
): void {
	const url = new URL(request.url);
	const requestHeaders: Record<string, string> = {};
	request.headers.forEach((value, key) => {
		requestHeaders[key] = value;
	});
	const searchParams: Record<string, string> = {};
	url.searchParams.forEach((value, key) => {
		searchParams[key] = value;
	});
	callHistory.record({
		body: bodyText,
		method: request.method,
		headers: requestHeaders,
		fullUrl: url.origin + url.pathname + url.search,
		origin: url.origin,
		path: url.pathname,
		searchParams,
		protocol: url.protocol,
		host: url.host,
		port: url.port,
		hash: url.hash,
	});
}
