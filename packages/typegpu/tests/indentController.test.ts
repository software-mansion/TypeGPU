import { describe, expect, it } from 'vitest';
import { IndentController } from '../src/resolutionCtx';

const INDENT_SPACES_COUNT = 2;

describe('IndentController', () => {
  it('indents properly', () => {
    for (const maxLevel of [0, 1, 7, 8, 9, 16, 20, 39, 40]) {
      const controller = new IndentController();
      for (let i = 0; i < maxLevel; i++) {
        controller.indent();
      }

      expect(controller.pre.length).toEqual(maxLevel * INDENT_SPACES_COUNT);
    }
  });

  it('dedents properly', () => {
    const controller = new IndentController();

    for (let i = 0; i < 10; i++) {
      controller.indent();
    } // -> 10

    for (let i = 0; i < 3; i++) {
      controller.dedent();
    } // -> 7

    controller.indent(); // -> 8
    controller.dedent(); // -> 7

    controller.dedent(); // -> 6
    controller.indent(); // -> 7

    expect(controller.pre.length).toEqual(7 * INDENT_SPACES_COUNT);
  });
});
