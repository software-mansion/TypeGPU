import { describe, expect, it } from 'vitest';
import * as d from '../../src/data/index.ts';
import { schemaCallWrapper } from '../../src/data/utils.ts';

describe('schemaCallWrapper', () => {
  it('throws when the schema is not callable', () => {
    expect(() => schemaCallWrapper(d.Void))
      .toThrowErrorMatchingInlineSnapshot(
        '[Error: Schema of type void is not callable or was called with invalid arguments.]',
      );
  });

  it('calls schema without arguments', () => {
    const TestStruct = d.struct({ v: d.vec2f });

    expect(schemaCallWrapper(TestStruct)).toStrictEqual({ v: d.vec2f() });
  });

  it('calls schema with arguments', () => {
    const TestStruct = d.struct({ v: d.vec2f });
    const testInstance = { v: d.vec2f(1, 2), u: d.vec3u() };

    expect(schemaCallWrapper(TestStruct, testInstance))
      .toStrictEqual({ v: d.vec2f(1, 2) });
  });

  it('works with loose data', () => {
    const TestUnstruct = d.unstruct({ v: d.float32x3 });
    const testInstance = { v: d.vec3f(1, 2, 3), u: d.vec3u() };

    expect(schemaCallWrapper(TestUnstruct, testInstance))
      .toStrictEqual({ v: d.vec3f(1, 2, 3) });
  });
});
