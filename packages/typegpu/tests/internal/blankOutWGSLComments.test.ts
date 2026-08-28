import { expect } from 'vitest';
import { test } from 'typegpu-testing-utility';
import { blankOutWGSLComments } from '../../src/rawShaderCodeUtils.ts';

test('blankOutWGSLComments', () => {
  const examples = [
    `hello/*a comment*/world`,
    `
    // line comment
    hello/*a comment /*nested */ */world`,
    `
/* docs */
fn() {
  const hello = 1 /* yup */;
}`,
  ];

  const blanks = [];
  for (const example of examples) {
    const blank = blankOutWGSLComments(example);
    expect(blank.length).toEqual(example.length);
    blanks.push(blank);
  }

  expect(blanks).toMatchInlineSnapshot(`
    [
      "hello             world",
      "
                       
        hello                          world",
      "
              
    fn() {
      const hello = 1          ;
    }",
    ]
  `);
});
