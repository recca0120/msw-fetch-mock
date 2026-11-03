import { createServer } from 'node:net';

/**
 * Shared helpers for the test suites (not part of the published package).
 */

/**
 * A local port that is guaranteed to be closed: bind to an ephemeral port, then release it.
 * Requests let through to the network fail fast with ECONNREFUSED — no external network,
 * no DNS, and unlike a "bad port" (e.g. :1, which fetch rejects before connecting) the
 * request really reaches the network layer.
 */
async function getClosedPort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as { port: number };
	await new Promise<void>((resolve) => server.close(() => resolve()));
	return port;
}

export const CLOSED_HOST = `127.0.0.1:${await getClosedPort()}`;
export const CLOSED_ORIGIN = `http://${CLOSED_HOST}`;

/**
 * The error cause code. `'ECONNREFUSED'` proves the request was let through to the
 * network; a request blocked by fetchMock fails before any connection is attempted.
 */
export function causeCode(error: unknown): string | undefined {
	return (error as { cause?: { code?: string } }).cause?.code;
}
