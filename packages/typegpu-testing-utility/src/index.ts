import { expect } from 'vitest';

declare module 'vitest' {
  // oxlint-disable-next-line typescript/no-explicit-any -- must match vitest's declaration
  interface Matchers<T = any> {
    toMatchNTimes: (regexp: RegExp, expectedMatches: number) => T;
  }
}

expect.extend({
  toMatchNTimes(received, regexp, expectedMatches) {
    const { isNot } = this;

    // A fresh global regex, so that non-global patterns don't loop forever,
    // and the caller's `lastIndex` is left untouched.
    const globalRegexp = new RegExp(
      regexp.source,
      regexp.flags.includes('g') ? regexp.flags : `${regexp.flags}g`,
    );
    const occurrences = [...String(received).matchAll(globalRegexp)].length;

    return {
      pass: occurrences === expectedMatches,
      actual: occurrences,
      expected: expectedMatches,
      message: () =>
        isNot
          ? `${received} shouldn't contain the pattern ${expectedMatches} times`
          : `${received} should contain the pattern ${expectedMatches} times`,
    };
  },
});

export {
  it,
  test,
  type MockCommandEncoder,
  type MockComputePassEncoder,
  type MockDevice,
  type MockRenderBundleEncoder,
  type MockRenderPassEncoder,
} from './extendedIt.ts';
export { CAPTURE, captureSnippets, simplifyType } from './capture.ts';
