import { attest } from '@ark/attest';
import { type } from 'arktype';
import { describe, it } from 'vitest';

describe('attest features', () => {
  it('type and value assertions', () => {
    const even = type('number%2');
    // asserts even.infer is exactly number
    attest<number>(even.infer);
    // make assertions about types and values seamlessly
    attest(even.infer).type.toString.snap('number');
    // including object literals- no more long inline strings!
    attest(even.json).snap({
      intersection: [{ domain: 'number' }, { divisor: 2 }],
    });
  });

  it('error assertions', () => {
    // Check type errors, runtime errors, or both at the same time!
    // @ts-expect-error
    attest(() => type('number%0')).throwsAndHasTypeError(
      '% operator must be followed by a non-zero integer literal (was 0)',
    );
    // @ts-expect-error
    attest(() => type({ [object]: 'string' })).type.errors(
      "Indexed key definition 'object' must be a string, number or symbol",
    );
  });

  it('completion snapshotting', () => {
    // snapshot expected completions for any string literal!
    // @ts-expect-error (if your expression would throw, prepend () =>)
    attest(() => type({ a: 'a', b: 'b' })).completions({
      a: ['any', 'alpha', 'alphanumeric'],
      b: ['bigint', 'boolean'],
    });
    type Legends = { faker?: '🐐'; [others: string]: unknown };
    // works for keys or index access as well (may need prettier-ignore to avoid removing quotes)
    // prettier-ignore
    attest({ f: '🐐' } as Legends).completions({ f: ['faker'] });
  });

  it('jsdoc snapshotting', () => {
    // match or snapshot expected jsdoc associated with the value passed to attest
    const T = type({
      /** FOO */
      foo: 'string',
    });

    const out = T.assert({ foo: 'foo' });

    attest(out.foo).jsdoc.snap('FOO');
  });

  //   it('integrate runtime logic with type assertions', () => {
  //     const ArrayOf = type('<t>', 't[]');
  //     const numericArray = arrayOf('number | bigint');
  //     // flexibly combine runtime logic with type assertions to customize your
  //     // tests beyond what is possible from pure static-analysis based type testing tools
  //     if (getTsVersionUnderTest().startsWith('5')) {
  //       // this assertion will only occur when testing TypeScript 5+!
  //       attest<(number | bigint)[]>(numericArray.infer);
  //     }
  //   });

  it('integrated type performance benchmarking', () => {
    const User = type({
      kind: "'admin'",
      'powers?': 'string[]',
    })
      .or({
        kind: "'superadmin'",
        'superpowers?': 'string[]',
      })
      .or({
        kind: "'pleb'",
      });
    attest.instantiations([7574, 'instantiations']);
  });
});
