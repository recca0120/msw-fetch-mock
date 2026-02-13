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

export class MockCallHistoryLog implements MockCallHistoryLogData {
	readonly body!: string | null;
	readonly method!: string;
	readonly headers!: Record<string, string>;
	readonly fullUrl!: string;
	readonly origin!: string;
	readonly path!: string;
	readonly searchParams!: Record<string, string>;
	readonly protocol!: string;
	readonly host!: string;
	readonly port!: string;
	readonly hash!: string;

	constructor(data: MockCallHistoryLogData) {
		Object.assign(this, data);
	}

	/**
	 * Alias for fullUrl - returns the complete URL
	 */
	get url(): string {
		return this.fullUrl;
	}

	json(): unknown {
		if (this.body === null) return null;
		return JSON.parse(this.body);
	}

	/**
	 * Returns a Map representation of this call log.
	 * Provided for compatibility with the `cloudflare:test` fetchMock API.
	 */
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

	/**
	 * Returns a pipe-separated string representation of this call log.
	 * Provided for compatibility with the `cloudflare:test` fetchMock API.
	 */
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
		criteria?: ((log: MockCallHistoryLog) => boolean) | CallHistoryFilterCriteria | RegExp,
	): boolean {
		if (criteria === undefined) return this.logs.length > 0;
		return this.filterCalls(criteria).length > 0;
	}

	/**
	 * Returns all recorded calls
	 */
	all(): MockCallHistoryLog[] {
		return [...this.logs];
	}

	firstCall(
		criteria?: ((log: MockCallHistoryLog) => boolean) | CallHistoryFilterCriteria | RegExp,
	): MockCallHistoryLog | undefined {
		if (criteria === undefined) return this.logs[0];
		return this.filterCalls(criteria)[0];
	}

	lastCall(
		criteria?: ((log: MockCallHistoryLog) => boolean) | CallHistoryFilterCriteria | RegExp,
	): MockCallHistoryLog | undefined {
		if (criteria === undefined) return this.logs[this.logs.length - 1];
		const filtered = this.filterCalls(criteria);
		return filtered[filtered.length - 1];
	}

	nthCall(
		n: number,
		criteria?: ((log: MockCallHistoryLog) => boolean) | CallHistoryFilterCriteria | RegExp,
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
		options?: { operator?: 'AND' | 'OR' },
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
			operator === 'AND' ? predicates.every((p) => p(log)) : predicates.some((p) => p(log)),
		);
	}

	/**
	 * Filter helper — matches a single field by exact string or RegExp.
	 *
	 * The `filterCallsByXxx` methods below mirror the `cloudflare:test` fetchMock
	 * API so that tests written for Cloudflare Workers can be reused with this library
	 * without modification.
	 */
	private filterBy(
		field: keyof MockCallHistoryLogData,
		filter: string | RegExp,
	): MockCallHistoryLog[] {
		return this.logs.filter((log) =>
			typeof filter === 'string' ? log[field] === filter : filter.test(String(log[field])),
		);
	}

	/** Filter calls by HTTP method. Mirrors `cloudflare:test` fetchMock API. */
	filterCallsByMethod(filter: string | RegExp): MockCallHistoryLog[] {
		return this.filterBy('method', filter);
	}

	/** Filter calls by path. Mirrors `cloudflare:test` fetchMock API. */
	filterCallsByPath(filter: string | RegExp): MockCallHistoryLog[] {
		return this.filterBy('path', filter);
	}

	/** Filter calls by origin. Mirrors `cloudflare:test` fetchMock API. */
	filterCallsByOrigin(filter: string | RegExp): MockCallHistoryLog[] {
		return this.filterBy('origin', filter);
	}

	/** Filter calls by protocol. Mirrors `cloudflare:test` fetchMock API. */
	filterCallsByProtocol(filter: string | RegExp): MockCallHistoryLog[] {
		return this.filterBy('protocol', filter);
	}

	/** Filter calls by host. Mirrors `cloudflare:test` fetchMock API. */
	filterCallsByHost(filter: string | RegExp): MockCallHistoryLog[] {
		return this.filterBy('host', filter);
	}

	/** Filter calls by port. Mirrors `cloudflare:test` fetchMock API. */
	filterCallsByPort(filter: string | RegExp): MockCallHistoryLog[] {
		return this.filterBy('port', filter);
	}

	/** Filter calls by URL hash. Mirrors `cloudflare:test` fetchMock API. */
	filterCallsByHash(filter: string | RegExp): MockCallHistoryLog[] {
		return this.filterBy('hash', filter);
	}

	/** Filter calls by full URL. Mirrors `cloudflare:test` fetchMock API. */
	filterCallsByFullUrl(filter: string | RegExp): MockCallHistoryLog[] {
		return this.filterBy('fullUrl', filter);
	}
}
