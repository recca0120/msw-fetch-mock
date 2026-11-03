import { FetchMock } from './fetch-mock';
import { NativeHandlerFactory } from './native-handler-factory';
import { NativeFetchInterceptor } from './native-interceptor';
import { type FetchInterceptor, type HandlerFactory } from './types';

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

interface DetectedEnvironment {
  createInterceptor: () => FetchInterceptor;
  handlerFactory: HandlerFactory;
}

/**
 * Detects MSW (falls back to native fetch patching), registers it as the
 * process-wide default for `new FetchMock()`, and returns it.
 */
export async function registerDefaultInterceptor(
  loader: InterceptorLoader = mswInterceptorLoader,
): Promise<DetectedEnvironment> {
  let detected: DetectedEnvironment;
  try {
    const { HandlerFactory, NodeFetchInterceptor } = await loader();
    detected = {
      createInterceptor: () => new NodeFetchInterceptor(),
      handlerFactory: HandlerFactory,
    };
  } catch {
    detected = {
      createInterceptor: () => new NativeFetchInterceptor(),
      handlerFactory: NativeHandlerFactory,
    };
  }
  FetchMock._defaultInterceptorFactory = detected.createInterceptor;
  FetchMock._handlerFactory = detected.handlerFactory;
  return detected;
}
