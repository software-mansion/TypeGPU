import { describe, expect, it } from 'vitest';
import { extractSourceMapURL } from '../src/node.ts';

describe('ECMA-426 JavaScript source map URL extraction', () => {
  it.each([
    ['', undefined],
    ['export const value = 1;', undefined],
    ['//# sourceMappingURL=shader.js.map\nexport const value = 1;', undefined],
    ['export const value = 1; //# sourceMappingURL=shader.js.map', undefined],
    ['//# sourceMappingURL=shader.js.map\n// "quote"', undefined],
    ["//# sourceMappingURL=shader.js.map\n// 'quote'", undefined],
    ['//# sourceMappingURL=shader.js.map\n// `backtick`', undefined],
    ['//# sourceMappingURL=shader.js.map\n// */', undefined],
    ['//# sourceMappingURL=shader.js.map\n/* ordinary block comment */', undefined],
    ['//# sourceMappingURL=shader.js.map', 'shader.js.map'],
    ['//@ sourceMappingURL=shader.js.map', 'shader.js.map'],
    ['//#sourceMappingURL=shader.js.map', 'shader.js.map'],
    ['//# sourceMappingURL=', ''],
    ['//# sourceMappingURL=first.map\n//# sourceMappingURL=last.map', 'last.map'],
    ['//# sourceMappingURL=shader.js.map\n// ordinary comment\n', 'shader.js.map'],
    ['//# sourceMappingURL=data:application/json;base64,e30=', 'data:application/json;base64,e30='],
  ])('extracts from %j', (source, expected) => {
    expect(extractSourceMapURL(source)).toBe(expected);
  });

  it.each(['\r\n', '\n', '\r', '\u2028', '\u2029'])('handles the line terminator %j', (newline) => {
    expect(
      extractSourceMapURL(
        `export const value = 1;${newline}//# sourceMappingURL=shader.js.map${newline}// trailing comment${newline}`,
      ),
    ).toBe('shader.js.map');
  });
});
