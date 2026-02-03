import { describe, it, expect } from 'vitest';
import { isSetupServerLike, isSetupWorkerLike, isMswAdapter } from './type-guards';

describe('isSetupServerLike', () => {
  it('should return true for object with listen and close methods', () => {
    const server = { listen: () => {}, close: () => {}, use: () => {}, resetHandlers: () => {} };
    expect(isSetupServerLike(server)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isSetupServerLike(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isSetupServerLike(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isSetupServerLike('string')).toBe(false);
  });

  it('should return false when listen is missing', () => {
    expect(isSetupServerLike({ close: () => {} })).toBe(false);
  });

  it('should return false when close is missing', () => {
    expect(isSetupServerLike({ listen: () => {} })).toBe(false);
  });

  it('should return false when listen is not a function', () => {
    expect(isSetupServerLike({ listen: 'not a fn', close: () => {} })).toBe(false);
  });

  it('should return false when close is not a function', () => {
    expect(isSetupServerLike({ listen: () => {}, close: 'not a fn' })).toBe(false);
  });
});

describe('isSetupWorkerLike', () => {
  it('should return true for object with start and stop methods', () => {
    const worker = { start: () => {}, stop: () => {}, use: () => {}, resetHandlers: () => {} };
    expect(isSetupWorkerLike(worker)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isSetupWorkerLike(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isSetupWorkerLike(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isSetupWorkerLike(42)).toBe(false);
  });

  it('should return false when start is missing', () => {
    expect(isSetupWorkerLike({ stop: () => {} })).toBe(false);
  });

  it('should return false when stop is missing', () => {
    expect(isSetupWorkerLike({ start: () => {} })).toBe(false);
  });

  it('should return false when start is not a function', () => {
    expect(isSetupWorkerLike({ start: true, stop: () => {} })).toBe(false);
  });
});

describe('isMswAdapter', () => {
  it('should return true for object with activate and deactivate methods', () => {
    const adapter = {
      activate: () => {},
      deactivate: () => {},
      use: () => {},
      resetHandlers: () => {},
    };
    expect(isMswAdapter(adapter)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isMswAdapter(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isMswAdapter(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isMswAdapter([])).toBe(false);
  });

  it('should return false when activate is missing', () => {
    expect(isMswAdapter({ deactivate: () => {} })).toBe(false);
  });

  it('should return false when deactivate is missing', () => {
    expect(isMswAdapter({ activate: () => {} })).toBe(false);
  });

  it('should return false when activate is not a function', () => {
    expect(isMswAdapter({ activate: 123, deactivate: () => {} })).toBe(false);
  });

  it('should not match setupServer as MswAdapter (no activate/deactivate)', () => {
    const server = { listen: () => {}, close: () => {}, use: () => {}, resetHandlers: () => {} };
    expect(isMswAdapter(server)).toBe(false);
  });
});
