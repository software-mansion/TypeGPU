import { wgsl } from 'typegpu';
import { describe, expect, it } from 'vitest';
import { parseWGSL } from './utils/parseWGSL';

describe('inline resolve', () => {
  it('injects returned constant in code', () => {
    const actual = wgsl`let bar = ${() => 123};`;
    const expected = 'let bar = 123;';

    expect(parseWGSL(actual)).toEqual(parseWGSL(expected));
  });

  it('injects returned function call in code', () => {
    const foo = wgsl.fn`() { return 123; }`.$name('foo');

    const actual = wgsl`fn main() { ${() => foo}(); }`;

    const expected = `
      fn foo() { return 123; }
      fn main() { foo(); }
    `;

    expect(parseWGSL(actual)).toEqual(parseWGSL(expected));
  });

  it('injects processed slot in code', () => {
    const slot = wgsl.slot(8).$name('slot');

    const actual = wgsl`fn main() { let foo = ${(get) => get(slot) ** 2}; }`;

    const expected = `
      fn main() { let foo = 64; }
    `;

    expect(parseWGSL(actual)).toEqual(parseWGSL(expected));
  });

  it('injects processed slot in function body', () => {
    const slot = wgsl.slot(8).$name('slot');

    const bar = wgsl.fn`() { let foo = ${(get) => get(slot) ** 2}; }`.$name(
      'bar',
    );

    const actual = wgsl`fn main() { ${bar}(); }`;

    const expected = `
      fn bar() { let foo = 64; }
      fn main() { bar(); }
    `;

    expect(parseWGSL(actual)).toEqual(parseWGSL(expected));
  });
});
