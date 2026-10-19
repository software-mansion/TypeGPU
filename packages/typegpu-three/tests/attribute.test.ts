import type NodeBuilder from 'three/src/nodes/core/NodeBuilder.js';
import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { attribute } from '@typegpu/three';

describe('attribute', () => {
  it.each([
    [d.f32, 'float'],
    [d.u32, 'uint'],
    [d.i32, 'int'],
    [d.vec2f, 'vec2'],
    [d.vec3u, 'uvec3'],
    [d.vec4i, 'ivec4'],
  ] as const)('maps the %s schema to the %s TSL type', (schema, tslType) => {
    const accessor = attribute('foo', schema);

    expect(accessor.node.nodeType).toBe(tslType);
    expect(accessor.node.getAttributeName({} as NodeBuilder)).toBe('foo');
  });
});
