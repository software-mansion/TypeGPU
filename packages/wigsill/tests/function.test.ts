import { parse } from '@wigsill/parser';
import { describe, expect, it } from 'vitest';
import { wgsl } from 'wigsill';

describe('wgsl.fn', () => {
  it('should represent an empty function', () => {
    const empty = wgsl.fn()`() -> {
      // do nothing
    }`;

    const code = wgsl`fn main() {
      ${empty}();
    }`;

    expect(parse(code));
  });
});
