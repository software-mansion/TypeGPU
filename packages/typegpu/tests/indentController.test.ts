import { describe, expect, it } from 'vitest';
import { IndentController } from '../src/resolutionCtx.ts';

const INDENT_SPACES_COUNT = 2;

describe('IndentController', () => {
  it('indents properly', () => {
    const controller = new IndentController();
    expect(controller.pre.length).toStrictEqual(0);

    for (let i = 1; i < 100; i++) {
      controller.indent();
      expect(controller.pre.length).toStrictEqual(i * INDENT_SPACES_COUNT);
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

    expect(controller.pre.length).toStrictEqual(7 * INDENT_SPACES_COUNT);
  });
});
