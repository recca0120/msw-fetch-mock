import type { MswAdapter, SetupServerLike, SetupWorkerLike } from './types';

export function isSetupServerLike(input: unknown): input is SetupServerLike {
  return (
    typeof input === 'object' &&
    input !== null &&
    'listen' in input &&
    typeof (input as SetupServerLike).listen === 'function' &&
    'close' in input &&
    typeof (input as SetupServerLike).close === 'function'
  );
}

export function isSetupWorkerLike(input: unknown): input is SetupWorkerLike {
  return (
    typeof input === 'object' &&
    input !== null &&
    'start' in input &&
    typeof (input as SetupWorkerLike).start === 'function' &&
    'stop' in input &&
    typeof (input as SetupWorkerLike).stop === 'function'
  );
}

export function isMswAdapter(input: unknown): input is MswAdapter {
  return (
    typeof input === 'object' &&
    input !== null &&
    'activate' in input &&
    typeof (input as MswAdapter).activate === 'function' &&
    'deactivate' in input &&
    typeof (input as MswAdapter).deactivate === 'function'
  );
}
