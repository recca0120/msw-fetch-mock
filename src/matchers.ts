import {
  type BodyMatcher,
  type HeaderValueMatcher,
  type PathMatcher,
  type PendingInterceptor,
  type StringMatcher,
} from './types';

/**
 * Parsed URL of a request, memoized per Request object: every interceptor tried for
 * one request (and the call recording) reads the same parse. A WeakMap, so an entry
 * goes away with its request.
 */
const requestUrls = new WeakMap<Request, URL>();
export function urlOf(request: Request): URL {
  let url = requestUrls.get(request);
  if (!url) {
    url = new URL(request.url);
    requestUrls.set(request, url);
  }
  return url;
}

/**
 * Parsed origin of a string-origin interceptor. Only successful parses are cached,
 * so an invalid origin still throws when a request is matched against it, as before.
 */
const originUrls = new Map<string, URL>();
function originUrlOf(origin: string): URL {
  let url = originUrls.get(origin);
  if (!url) {
    url = new URL(origin);
    originUrls.set(origin, url);
  }
  return url;
}

export function isPending(p: PendingInterceptor): boolean {
  if (p.persist) return p.timesInvoked === 0;
  return p.timesInvoked < p.times;
}

/** Human-readable form of a string / RegExp / function matcher (for pendingInterceptors()). */
export function describeMatcher(matcher: StringMatcher): string {
  if (typeof matcher === 'string') return matcher;
  if (typeof matcher === 'function') return '<function>';
  return matcher.toString();
}

export function matchesValue(value: string, matcher: StringMatcher): boolean {
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
  const url = urlOf(request);
  const originUrl = originUrlOf(origin);

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
  const url = urlOf(request);
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
