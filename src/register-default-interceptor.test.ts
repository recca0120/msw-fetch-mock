import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FetchMock } from './fetch-mock';
import { HandlerFactory } from './handler-factory';
import { NativeHandlerFactory } from './native-handler-factory';
import { NativeFetchInterceptor } from './native-interceptor';
import { NodeFetchInterceptor } from './node-interceptor';
import { registerDefaultInterceptor } from './register-default-interceptor';

describe('registerDefaultInterceptor', () => {
  // registerDefaultInterceptor writes process-wide statics; restore what was there before
  let savedInterceptorFactory: typeof FetchMock._defaultInterceptorFactory;
  let savedHandlerFactory: typeof FetchMock._handlerFactory;

  beforeEach(() => {
    savedInterceptorFactory = FetchMock._defaultInterceptorFactory;
    savedHandlerFactory = FetchMock._handlerFactory;
  });

  afterEach(() => {
    FetchMock._defaultInterceptorFactory = savedInterceptorFactory;
    FetchMock._handlerFactory = savedHandlerFactory;
  });

  it('should register msw interceptor when msw is available', async () => {
    await registerDefaultInterceptor();

    const interceptor = FetchMock._defaultInterceptorFactory!();
    expect(interceptor).toBeInstanceOf(NodeFetchInterceptor);
    expect(FetchMock._handlerFactory).toBe(HandlerFactory);
  });

  it('should fallback to native interceptor when msw is not available', async () => {
    await registerDefaultInterceptor(async () => {
      throw new Error('msw not installed');
    });

    const interceptor = FetchMock._defaultInterceptorFactory!();
    expect(interceptor).toBeInstanceOf(NativeFetchInterceptor);
    expect(FetchMock._handlerFactory).toBe(NativeHandlerFactory);
  });
});
