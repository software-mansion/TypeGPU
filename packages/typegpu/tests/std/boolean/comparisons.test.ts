import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe.each([
  ['lt', std.lt, '<'],
  ['le', std.le, '<='],
  ['gt', std.gt, '>'],
  ['ge', std.ge, '>='],
] as const)('component-wise vector %s', (_name, comparison, operator) => {
  it.each([
    [d.vec2f, d.vec2b],
    [d.vec3f, d.vec3b],
    [d.vec4f, d.vec4b],
    [d.vec2i, d.vec2b],
    [d.vec3i, d.vec3b],
    [d.vec4i, d.vec4b],
    [d.vec2u, d.vec2b],
    [d.vec3u, d.vec3b],
    [d.vec4u, d.vec4b],
  ] as const)('resolves %s comparison in WGSL', (schema, booleanSchema) => {
    const compare = tgpu.fn([schema, schema], booleanSchema)((lhs, rhs) => comparison(lhs, rhs));

    expect(tgpu.resolve([compare])).toBe(
      `fn compare(lhs: ${schema.type}, rhs: ${schema.type}) -> ${booleanSchema.type} {\n` +
        `  return (lhs ${operator} rhs);\n}`,
    );
  });
});
