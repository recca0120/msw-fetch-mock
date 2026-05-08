import { FetchMock } from './fetch-mock';
import { NativeHandlerFactory } from './native-handler-factory';
import { NativeFetchInterceptor } from './native-interceptor';

type InterceptorLoader = () => Promise<{
	HandlerFactory: typeof import('./handler-factory').HandlerFactory;
	NodeFetchInterceptor: typeof import('./node-interceptor').NodeFetchInterceptor;
}>;

const mswInterceptorLoader: InterceptorLoader = async () => {
	// Probe for msw availability first; @vite-ignore prevents bundlers
	// from tracing this optional dependency into the bundle.
	await import(/* @vite-ignore */ 'msw');

	const { HandlerFactory } = await import('./handler-factory');
	const { NodeFetchInterceptor } = await import('./node-interceptor');
	return { HandlerFactory, NodeFetchInterceptor };
};

export async function registerDefaultInterceptor(
	loader: InterceptorLoader = mswInterceptorLoader,
): Promise<void> {
	try {
		const { HandlerFactory, NodeFetchInterceptor } = await loader();
		FetchMock._defaultInterceptorFactory = () => new NodeFetchInterceptor();
		FetchMock._handlerFactory = HandlerFactory;
	} catch {
		FetchMock._defaultInterceptorFactory = () => new NativeFetchInterceptor();
		FetchMock._handlerFactory = NativeHandlerFactory;
	}
}
