import { test } from 'typegpu-testing-utility';
import { expect, vi } from 'vitest';
import tgpu, { d } from 'typegpu';

import { expectSnippetOf } from '../utils/parseResolved.ts';

test('multiplying i32 with a float literal should implicitly convert to an f32', () => {
  using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  function main() {
    'use gpu';
    const a = d.i32(1) * 0.001;
    const int = d.i32(1);
    return int * 0.001;
  }

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn main() -> f32 {
      const a = 1e-3f;
      const int = 1i;
      return (f32(int) * 1e-3f);
    }"
  `);

  expectSnippetOf(() => {
    'use gpu';
    return d.i32(1) * 0.001;
  }).toStrictEqual([0.001, d.f32, 'constant']);

  expect(consoleWarnSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Implicit conversions from [
      1i: i32
    ] to f32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
      [
        "Implicit conversions from [
      int: i32
    ] to f32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
      [
        "Implicit conversions from [
      1i: i32
    ] to f32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
    ]
  `);
});

test('multiplying u32 with a float literal should implicitly convert to an f32', () => {
  using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  function main() {
    'use gpu';
    const a = d.u32(10) * 0.001;
    const int = d.u32(100);
    return int * 0.001;
  }

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn main() -> f32 {
      const a = 0.01f;
      const int = 100u;
      return (f32(int) * 1e-3f);
    }"
  `);

  expectSnippetOf(() => {
    'use gpu';
    return d.u32(1) * 0.001;
  }).toStrictEqual([0.001, d.f32, 'constant']);

  expect(consoleWarnSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Implicit conversions from [
      10u: u32
    ] to f32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
      [
        "Implicit conversions from [
      int: u32
    ] to f32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
      [
        "Implicit conversions from [
      1u: u32
    ] to f32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
    ]
  `);
});

test('multiplying u32 with an i32 should implicitly convert to an i32', () => {
  using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  function main() {
    'use gpu';
    const uint = d.u32(5);
    const int = d.i32(3);
    return uint * int;
  }

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn main() -> i32 {
      const uint = 5u;
      const int = 3i;
      return (i32(uint) * int);
    }"
  `);

  expect(consoleWarnSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Implicit conversions from [
      uint: u32
    ] to i32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
    ]
  `);
});
