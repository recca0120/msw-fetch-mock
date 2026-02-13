import { describe, expect, it } from 'vitest';
import { NativeHandlerFactory } from './native-handler-factory';

describe('NativeHandlerFactory', () => {
  describe('createHandler', () => {
    it('should return a descriptor with method, urlPattern, and handlerFn', () => {
      const handlerFn = async () => undefined;
      const handler = NativeHandlerFactory.createHandler('GET', '/test', handlerFn);

      expect(handler).toEqual({
        method: 'GET',
        urlPattern: '/test',
        handlerFn,
      });
    });

    it('should accept RegExp as urlPattern', () => {
      const handlerFn = async () => undefined;
      const pattern = /^https:\/\/example\.com/;
      const handler = NativeHandlerFactory.createHandler('POST', pattern, handlerFn);

      expect(handler).toEqual({
        method: 'POST',
        urlPattern: pattern,
        handlerFn,
      });
    });
  });

  describe('buildResponse', () => {
    it('should return a JSON Response with status 200', async () => {
      const response = NativeHandlerFactory.buildResponse(200, { data: 1 });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: 1 });
    });

    it('should return a Response with null body for status 204', () => {
      const response = NativeHandlerFactory.buildResponse(204, null);

      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
    });

    it('should return a Response with undefined body', () => {
      const response = NativeHandlerFactory.buildResponse(204, undefined);

      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
    });

    it('should include custom headers', async () => {
      const headers = new Headers({ 'X-Custom': 'test-value' });
      const response = NativeHandlerFactory.buildResponse(200, { ok: true }, headers);

      expect(response.headers.get('X-Custom')).toBe('test-value');
      expect(await response.json()).toEqual({ ok: true });
    });
  });

  describe('buildErrorResponse', () => {
    it('should return an error Response', () => {
      const response = NativeHandlerFactory.buildErrorResponse();

      expect(response.type).toBe('error');
    });
  });
});
