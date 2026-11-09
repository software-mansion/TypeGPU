# `@typegpu/three` - TypeGPU in Existing Three.js Apps

For projects that already render with Three.js `WebGPURenderer`: write TSL nodes as `'use gpu'` functions. Docs: <https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-three.md>.

- `t3.toTSL(fn)`: zero-argument `'use gpu'` function → TSL node for material slots (`colorNode`, `positionNode`, ...) or `.compute(count)`.
- `t3.fromTSL(node, schema)`: TSL node (or Three texture) → accessor; `.$` inside GPU code, `.node` for CPU-side updates.
- Shorthands: `t3.attribute(name, schema)`, `t3.uniform(value, schema)`, `t3.uniformArray(values, elementSchema)`, `t3.instancedArray(count, elementSchema)`.
- Built-ins: `t3.uv()`, `t3.vertexColor()` (functions), and accessors such as `t3.time`, `t3.instanceIndex`, `t3.positionLocal`, `t3.normalWorld`, `t3.cameraPosition`, `t3.modelWorldMatrix`.

```ts
import * as THREE from 'three/webgpu';
import * as t3 from '@typegpu/three';
import { d, std } from 'typegpu';

const tint = t3.uniform(new THREE.Color('hotpink'), d.vec3f);

const material = new THREE.MeshStandardNodeMaterial();
material.colorNode = t3.toTSL(() => {
  'use gpu';
  const stripe = std.step(0.5, std.fract(t3.uv().$.x * 10 + t3.time.$));
  return d.vec4f(tint.$ * stripe, 1);
});

tint.node.value.set('skyblue');
```

Three owns the device, resources and frame loop; TypeGPU contributes shader code only. Pass data through TSL nodes and `fromTSL`; a `root`, TypeGPU buffers, textures and bind groups do not apply inside `toTSL`.
