export interface MockCallHistoryLogData {
  body: string | null;
  method: string;
  headers: Record<string, string>;
  fullUrl: string;
  origin: string;
  path: string;
  searchParams: Record<string, string>;
  protocol: string;
  host: string;
  port: string;
  hash: string;
}

export class MockCallHistoryLog {
  readonly body: string | null;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly fullUrl: string;
  readonly origin: string;
  readonly path: string;
  readonly searchParams: Record<string, string>;
  readonly protocol: string;
  readonly host: string;
  readonly port: string;
  readonly hash: string;

  constructor(data: MockCallHistoryLogData) {
    this.body = data.body;
    this.method = data.method;
    this.headers = data.headers;
    this.fullUrl = data.fullUrl;
    this.origin = data.origin;
    this.path = data.path;
    this.searchParams = data.searchParams;
    this.protocol = data.protocol;
    this.host = data.host;
    this.port = data.port;
    this.hash = data.hash;
  }

  json(): unknown {
    if (this.body === null) return null;
    return JSON.parse(this.body);
  }

  toMap(): Map<string, string | null | Record<string, string>> {
    return new Map<string, string | null | Record<string, string>>([
      ['body', this.body],
      ['method', this.method],
      ['headers', this.headers],
      ['fullUrl', this.fullUrl],
      ['origin', this.origin],
      ['path', this.path],
      ['searchParams', this.searchParams],
      ['protocol', this.protocol],
      ['host', this.host],
      ['port', this.port],
      ['hash', this.hash],
    ]);
  }

  toString(): string {
    return [
      `method->${this.method}`,
      `protocol->${this.protocol}`,
      `host->${this.host}`,
      `port->${this.port}`,
      `origin->${this.origin}`,
      `path->${this.path}`,
      `hash->${this.hash}`,
      `fullUrl->${this.fullUrl}`,
    ].join('|');
  }
}

export interface CallHistoryFilterCriteria {
  method?: string;
  path?: string;
  origin?: string;
  protocol?: string;
  host?: string;
  port?: string;
  hash?: string;
  fullUrl?: string;
}

export class MockCallHistory {
  private logs: MockCallHistoryLog[] = [];

  get length(): number {
    return this.logs.length;
  }

  record(data: MockCallHistoryLogData): void {
    this.logs.push(data instanceof MockCallHistoryLog ? data : new MockCallHistoryLog(data));
  }

  called(
    criteria?: ((log: MockCallHistoryLog) => boolean) | CallHistoryFilterCriteria | RegExp
  ): boolean {
    if (criteria === undefined) return this.logs.length > 0;
    return this.filterCalls(criteria).length > 0;
  }

  calls(): MockCallHistoryLog[] {
    return [...this.logs];
  }

  firstCall(
    criteria?: ((log: MockCallHistoryLog) => boolean) | CallHistoryFilterCriteria | RegExp
  ): MockCallHistoryLog | undefined {
    if (criteria === undefined) return this.logs[0];
    return this.filterCalls(criteria)[0];
  }

  lastCall(
    criteria?: ((log: MockCallHistoryLog) => boolean) | CallHistoryFilterCriteria | RegExp
  ): MockCallHistoryLog | undefined {
    if (criteria === undefined) return this.logs[this.logs.length - 1];
    const filtered = this.filterCalls(criteria);
    return filtered[filtered.length - 1];
  }

  nthCall(
    n: number,
    criteria?: ((log: MockCallHistoryLog) => boolean) | CallHistoryFilterCriteria | RegExp
  ): MockCallHistoryLog | undefined {
    if (criteria === undefined) return this.logs[n - 1];
    return this.filterCalls(criteria)[n - 1];
  }

  clear(): void {
    this.logs = [];
  }

  [Symbol.iterator](): Iterator<MockCallHistoryLog> {
    return this.logs[Symbol.iterator]();
  }

  filterCalls(
    criteria: ((log: MockCallHistoryLog) => boolean) | CallHistoryFilterCriteria | RegExp,
    options?: { operator?: 'AND' | 'OR' }
  ): MockCallHistoryLog[] {
    if (typeof criteria === 'function') {
      return this.logs.filter(criteria);
    }

    if (criteria instanceof RegExp) {
      return this.logs.filter((log) => criteria.test(log.toString()));
    }

    const operator = options?.operator ?? 'OR';
    const keys = Object.keys(criteria) as (keyof CallHistoryFilterCriteria)[];
    const predicates = keys
      .filter((key) => criteria[key] !== undefined)
      .map((key) => (log: MockCallHistoryLog) => log[key] === criteria[key]);

    if (predicates.length === 0) return [...this.logs];

    return this.logs.filter((log) =>
      operator === 'AND' ? predicates.every((p) => p(log)) : predicates.some((p) => p(log))
    );
  }

  private filterBy(
    field: keyof MockCallHistoryLogData,
    filter: string | RegExp
  ): MockCallHistoryLog[] {
    return this.logs.filter((log) =>
      typeof filter === 'string' ? log[field] === filter : filter.test(String(log[field]))
    );
  }

  filterCallsByMethod(filter: string | RegExp): MockCallHistoryLog[] {
    return this.filterBy('method', filter);
  }

  filterCallsByPath(filter: string | RegExp): MockCallHistoryLog[] {
    return this.filterBy('path', filter);
  }

  filterCallsByOrigin(filter: string | RegExp): MockCallHistoryLog[] {
    return this.filterBy('origin', filter);
  }

  filterCallsByProtocol(filter: string | RegExp): MockCallHistoryLog[] {
    return this.filterBy('protocol', filter);
  }

  filterCallsByHost(filter: string | RegExp): MockCallHistoryLog[] {
    return this.filterBy('host', filter);
  }

  filterCallsByPort(filter: string | RegExp): MockCallHistoryLog[] {
    return this.filterBy('port', filter);
  }

  filterCallsByHash(filter: string | RegExp): MockCallHistoryLog[] {
    return this.filterBy('hash', filter);
  }

  filterCallsByFullUrl(filter: string | RegExp): MockCallHistoryLog[] {
    return this.filterBy('fullUrl', filter);
  }
}
