// Loose on purpose so node:test's and Jest's functions (with their own TestFn types) fit.
// biome-ignore lint/suspicious/noExplicitAny: any runner's callback type must be accepted
type Callback = (...args: any[]) => any;

/** The FetchMock the suite created (typed loosely: the shared file does not import the package). */
export interface FetchMockLike {
	// biome-ignore lint/suspicious/noExplicitAny: mirrors FetchMock's fluent API without importing it
	get(origin: string): any;
}

export interface ScenarioRunner {
	describe(name: string, fn: Callback): unknown;
	it(name: string, fn: Callback): unknown;
	before(fn: Callback): unknown;
	after(fn: Callback): unknown;
	afterEach(fn: Callback): unknown;
}

export interface ScenarioAssert {
	equal(actual: unknown, expected: unknown): unknown;
	deepEqual(actual: unknown, expected: unknown): unknown;
	ok(value: unknown): unknown;
	throws(fn: () => unknown, pattern: RegExp): unknown;
	rejects(fn: () => Promise<unknown>): Promise<unknown>;
}

export function jestAssert(expect: unknown): ScenarioAssert;

export function defineScenarios(options: {
	label: string;
	runner: ScenarioRunner;
	createFetchMock: () => unknown;
	assert?: ScenarioAssert;
	exclusiveActivation?: boolean;
}): { getFetchMock: () => FetchMockLike };
