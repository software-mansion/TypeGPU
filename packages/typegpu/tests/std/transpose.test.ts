import { it } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('std.transpose', () => {
  it('transposes mat2x2f in JS', () => {
    expect(std.transpose(d.mat2x2f(1, 2, 3, 4)).toString()).toMatchInlineSnapshot(
      `"mat2x2f(1, 3, 2, 4)"`,
    );
  });

  it('transposes mat3x3f in JS', () => {
    expect(std.transpose(d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9)).toString()).toMatchInlineSnapshot(
      `"mat3x3f(1, 4, 7, 2, 5, 8, 3, 6, 9)"`,
    );
  });

  it('transposes mat4x4f in JS', () => {
    expect(
      std.transpose(d.mat4x4f(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)).toString(),
    ).toMatchInlineSnapshot(`"mat4x4f(1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16)"`);
  });

  it('generates call to builtin transpose() function', () => {
    const foo = tgpu.const(d.mat2x2f, d.mat2x2f(1, 2, 3, 4));

    function main() {
      'use gpu';
      return std.transpose(foo.$);
    }

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "const foo: mat2x2f = mat2x2f(1, 2, 3, 4);

      fn main() -> mat2x2f {
        return transpose(foo);
      }"
    `);
  });
});
