import { MockCallHistory } from './mock-call-history';
import type { PathMatcher, HeaderValueMatcher, BodyMatcher, PendingInterceptor } from './types';

export function isPending(p: PendingInterceptor): boolean {
  if (p.persist) return p.timesInvoked === 0;
  return p.timesInvoked < p.times;
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesValue(
  value: string,
  matcher: string | RegExp | ((v: string) => boolean)
): boolean {
  if (typeof matcher === 'string') return value === matcher;
  if (matcher instanceof RegExp) return matcher.test(value);
  return matcher(value);
}

export function matchPath(request: Request, origin: string, pathMatcher: PathMatcher): boolean {
  if (typeof pathMatcher === 'string') return true; // string paths are matched by MSW URL pattern
  const url = new URL(request.url);
  const originPrefix = new URL(origin).pathname.replace(/\/$/, '');
  const fullPath = url.pathname + url.search;
  const relativePath = fullPath.startsWith(originPrefix)
    ? fullPath.slice(originPrefix.length)
    : fullPath;
  return matchesValue(relativePath, pathMatcher);
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
  headers?: Record<string, HeaderValueMatcher>
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
  bodyText: string | null
) {
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
