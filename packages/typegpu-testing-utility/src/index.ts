import { expect } from 'vitest';

declare module 'vitest' {
  interface Matchers<T = any> {
    toMatchNTimes: (regexp: RegExp, expectedMatches: number) => T;
  }
}

expect.extend({
  toMatchNTimes(received, regexp, expectedMatches) {
    const { isNot } = this;

    let occurrances = 0;

    while (regexp.exec(received) !== null) {
      occurrances++;
    }

    return {
      pass: occurrances === expectedMatches,
      actual: occurrances,
      expected: expectedMatches,
      message: () =>
        isNot
          ? `${received} shouldn't contain the pattern ${expectedMatches} times`
          : `${received} should contain the pattern ${expectedMatches} times`,
    };
  },
});

export { it, test } from './extendedIt.ts';
