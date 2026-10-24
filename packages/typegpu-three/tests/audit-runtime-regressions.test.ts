import * as THREE from 'three/webgpu';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
import { expect, it } from 'vitest';
import { d } from 'typegpu';
import { instancedArray, toTSL, uniformArray } from '@typegpu/three';

class THREERendererMock {
  backend = { isWebGPUBackend: true };

  hasFeature() {
    return false;
  }
}

it('B10 preserves the declared unsigned uniform-array element type', () => {
  const values = uniformArray([1, 2], d.u32);
  expect(values.node.getElementType(new WGSLNodeBuilder())).toBe('uint');
});

it('B10 preserves the declared signed uniform-array element type', () => {
  const values = uniformArray([-1, 2], d.i32);
  expect(values.node.getElementType(new WGSLNodeBuilder())).toBe('int');
});

it('B10 reads the scalar component of a padded TSL uniform-array element', () => {
  const values = uniformArray([1, 2], d.f32);
  const node = toTSL(() => {
    'use gpu';
    return values.$[0];
  });
  const builder = new WGSLNodeBuilder();
  builder.renderer = new THREERendererMock() as unknown as THREE.Renderer;
  builder.setShaderStage('fragment');
  // @ts-expect-error -- Three.js types still call the setup stage construct.
  builder.setBuildStage('setup');
  node.build(builder);
  builder.setBuildStage('analyze');
  node.build(builder);
  builder.setBuildStage('generate');
  node.build(builder);

  // Three stores scalar uniform arrays as vec4 elements in WGSL uniform buffers.
  expect(builder.getCodes('fragment')).toMatch(/\.value\[0i\]\.x/);
});

it('B56 allocates all sixteen components of each mat4 storage-array element', () => {
  const values = instancedArray(2, d.mat4x4f);
  expect(values.node.value.itemSize).toBe(16);
  expect(values.node.value.array.length).toBe(32);
});
