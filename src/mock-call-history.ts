export interface MockCallHistoryLog {
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

export interface CallHistoryFilterCriteria {
  method?: string;
  path?: string;
  origin?: string;
}

export class MockCallHistory {
  private logs: MockCallHistoryLog[] = [];

  record(log: MockCallHistoryLog): void {
    this.logs.push(log);
  }

  calls(): MockCallHistoryLog[] {
    return [...this.logs];
  }

  firstCall(): MockCallHistoryLog | undefined {
    return this.logs[0];
  }

  lastCall(): MockCallHistoryLog | undefined {
    return this.logs[this.logs.length - 1];
  }

  nthCall(n: number): MockCallHistoryLog | undefined {
    return this.logs[n - 1];
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
      return this.logs.filter((log) => criteria.test(`${log.method} ${log.fullUrl}`));
    }

    const operator = options?.operator ?? 'OR';
    const predicates: ((log: MockCallHistoryLog) => boolean)[] = [];
    if (criteria.method !== undefined) {
      predicates.push((log) => log.method === criteria.method);
    }
    if (criteria.path !== undefined) {
      predicates.push((log) => log.path === criteria.path);
    }
    if (criteria.origin !== undefined) {
      predicates.push((log) => log.origin === criteria.origin);
    }

    if (predicates.length === 0) return [...this.logs];

    return this.logs.filter((log) =>
      operator === 'AND' ? predicates.every((p) => p(log)) : predicates.some((p) => p(log))
    );
  }

  filterCallsByMethod(filter: string | RegExp): MockCallHistoryLog[] {
    return this.logs.filter((log) =>
      typeof filter === 'string' ? log.method === filter : filter.test(log.method)
    );
  }

  filterCallsByPath(filter: string | RegExp): MockCallHistoryLog[] {
    return this.logs.filter((log) =>
      typeof filter === 'string' ? log.path === filter : filter.test(log.path)
    );
  }

  filterCallsByOrigin(filter: string | RegExp): MockCallHistoryLog[] {
    return this.logs.filter((log) =>
      typeof filter === 'string' ? log.origin === filter : filter.test(log.origin)
    );
  }
}
