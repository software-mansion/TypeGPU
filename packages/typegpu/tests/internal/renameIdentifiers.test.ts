import { test } from 'typegpu-testing-utility';
import { expect } from 'vitest';
import { renameIdentifiers } from '../../src/rawShaderCodeUtils.ts';

test('renameIdentifiers', () => {
  const examples: [string, Map<string, string>][] = [
    ['f.f + 1f + f2', new Map([['f', 'g']])],
    ['const a = 1; const b = 1;', new Map([['a', 'a_1']])],
    [
      `fn foo() {
    const a = 1;
    const b = 1;
    }`,
      new Map([['a', 'a_1']]),
    ],
  ];

  expect(examples.map((e) => renameIdentifiers(...e))).toMatchInlineSnapshot(
    `
    [
      "g.f + 1f + f2",
      "const a_1 = 1; const b = 1;",
      "fn foo() {
        const a_1 = 1;
        const b = 1;
        }",
    ]
  `,
  );
});
