import { afterEach, describe, expect, it } from 'vitest';
import { FetchMock } from './fetch-mock';
import { NativeHandlerFactory } from './native-handler-factory';
import { NativeFetchInterceptor } from './native-interceptor';
import { registerDefaultInterceptor } from './register-default-interceptor';

describe('registerDefaultInterceptor', () => {
	afterEach(() => {
		FetchMock._defaultInterceptorFactory = undefined;
		FetchMock._handlerFactory = undefined;
	});

	it('should register msw interceptor when msw is available', async () => {
		await registerDefaultInterceptor();

		const interceptor = FetchMock._defaultInterceptorFactory!();
		expect(interceptor.constructor.name).toBe('NodeFetchInterceptor');
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
