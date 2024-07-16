import { parse } from '@wigsill/parser';
import { describe, expect, it } from 'vitest';
import { StrictNameRegistry, wgsl } from '../src';
import { ResolutionCtxImpl } from '../src/programBuilder';

describe('wgsl.fn', () => {
  it('should represent an empty function', () => {
    const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

    const empty = wgsl.fn()`() -> {
      // do nothing
    }`.alias('empty');

    const shader = wgsl`
    fn main() {
      // ${empty}();
    }`;

    expect(parse(ctx.resolve(shader))).toEqual(
      parse(`
fn empty() {
  // still does nothing
}

fn main() {
  // empty();
}
`),
    );
  });
});
