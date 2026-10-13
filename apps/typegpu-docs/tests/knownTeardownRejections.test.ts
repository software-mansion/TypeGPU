import { describe, expect, it } from 'vitest';
import { isKnownTeardownRejection } from './knownTeardownRejections.ts';

const GAME_OF_LIFE = 'simulation--game-of-life';

function rejection(message: string, stack: string) {
  return Object.assign(new Error(message), { stack: `AbortError: ${message}\n${stack}` });
}

const unmapped =
  "Failed to execute 'mapAsync' on 'GPUBuffer': Buffer was unmapped before mapping was resolved.";
const deviceLost =
  "Failed to execute 'mapAsync' on 'GPUBuffer': The Device was lost before mapping was resolved.";

function teardownStack(examplePath: string) {
  return [
    '    at TgpuRootImpl.destroy (http://localhost:63315/@fs/repo/packages/typegpu/src/core/root/init.ts:246:16)',
    `    at Module.onCleanup (http://localhost:63315/src/examples/${examplePath}/index.ts?update=1:509:7)`,
    '    at http://localhost:63315/tests/examples.test.browser.ts:80:11',
  ].join('\n');
}

const gameOfLifeStack = teardownStack('simulation/game-of-life');

describe('isKnownTeardownRejection', () => {
  describe('tolerated: the game-of-life teardown', () => {
    it('tolerates an unmapped buffer', () => {
      expect(isKnownTeardownRejection(rejection(unmapped, gameOfLifeStack), GAME_OF_LIFE)).toBe(
        true,
      );
    });

    it('tolerates the device-lost variant, under the same restriction', () => {
      expect(isKnownTeardownRejection(rejection(deviceLost, gameOfLifeStack), GAME_OF_LIFE)).toBe(
        true,
      );
    });
  });

  describe('rejected: the same message from somewhere else', () => {
    it.each([
      ['unmapped buffer', unmapped],
      ['device lost', deviceLost],
    ])('rejects "%s" from another example (stack and cleaned example)', (_, message) => {
      expect(
        isKnownTeardownRejection(
          rejection(message, teardownStack('simulation/boids')),
          'simulation--boids',
        ),
      ).toBe(false);
    });

    it('rejects a game-of-life stack when another example was cleaned up last', () => {
      expect(
        isKnownTeardownRejection(rejection(unmapped, gameOfLifeStack), 'simulation--boids'),
      ).toBe(false);
      expect(isKnownTeardownRejection(rejection(unmapped, gameOfLifeStack), undefined)).toBe(false);
    });

    it('rejects another example stack even when game-of-life was cleaned up last', () => {
      expect(
        isKnownTeardownRejection(
          rejection(unmapped, teardownStack('simulation/boids')),
          GAME_OF_LIFE,
        ),
      ).toBe(false);
    });

    it('rejects an example whose directory merely contains the same name', () => {
      expect(
        isKnownTeardownRejection(
          rejection(unmapped, teardownStack('simulation/game-of-life-3d')),
          GAME_OF_LIFE,
        ),
      ).toBe(false);
    });
  });

  describe('rejected: no teardown stack', () => {
    const cases: [string, string][] = [
      [
        'not made from a destroy() call',
        '    at readValues (http://localhost:63315/src/examples/simulation/game-of-life/index.ts:120:10)',
      ],
      [
        'a destroy() that is not made from an onCleanup',
        [
          '    at TgpuRootImpl.destroy (http://localhost:63315/@fs/repo/packages/typegpu/src/core/root/init.ts:246:16)',
          '    at resize (http://localhost:63315/src/examples/simulation/game-of-life/index.ts:300:5)',
        ].join('\n'),
      ],
      [
        'an onCleanup without a destroy() call',
        '    at Module.onCleanup (http://localhost:63315/src/examples/simulation/game-of-life/index.ts:509:7)',
      ],
      [
        'the frames in the wrong order (onCleanup called destroy, not the other way round)',
        [
          '    at Module.onCleanup (http://localhost:63315/src/examples/simulation/game-of-life/index.ts:509:7)',
          '    at TgpuRootImpl.destroy (http://localhost:63315/@fs/repo/packages/typegpu/src/core/root/init.ts:246:16)',
        ].join('\n'),
      ],
    ];

    it.each(cases)('rejects the message with %s', (_, stack) => {
      expect(isKnownTeardownRejection(rejection(unmapped, stack), GAME_OF_LIFE)).toBe(false);
      expect(isKnownTeardownRejection(rejection(deviceLost, stack), GAME_OF_LIFE)).toBe(false);
    });

    it('does not take a `destroyed` identifier for a destroy() call', () => {
      const stack = [
        '    at TgpuRootImpl.destroyed (http://localhost:63315/@fs/repo/init.ts:1:1)',
        '    at Module.onCleanup (http://localhost:63315/src/examples/simulation/game-of-life/index.ts:509:7)',
      ].join('\n');

      expect(isKnownTeardownRejection(rejection(unmapped, stack), GAME_OF_LIFE)).toBe(false);
    });
  });

  describe('rejected: other errors stay fatal', () => {
    it.each([
      'failed to call OrtRun(). ERROR_CODE: 6, ERROR_MESSAGE: __next_prime overflow',
      'cannot run inference. invalid session id: 1',
      'RuntimeError: null function',
      'Out of memory',
      "Failed to execute 'mapAsync' on 'GPUBuffer': Buffer is already mapped.",
    ])('rejects "%s" with the game-of-life teardown stack', (message) => {
      expect(isKnownTeardownRejection(rejection(message, gameOfLifeStack), GAME_OF_LIFE)).toBe(
        false,
      );
    });

    it('rejects rejections that carry no stack or are not errors', () => {
      expect(isKnownTeardownRejection(unmapped, GAME_OF_LIFE)).toBe(false);
      expect(isKnownTeardownRejection({ message: unmapped }, GAME_OF_LIFE)).toBe(false);
      expect(isKnownTeardownRejection(undefined, GAME_OF_LIFE)).toBe(false);
      expect(isKnownTeardownRejection(null, GAME_OF_LIFE)).toBe(false);
    });
  });
});
