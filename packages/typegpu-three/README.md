<div align="center">

# @typegpu/three

🚧 **Under Construction** 🚧

</div>

A helper library for using TypeGPU with Three.js.

```ts
import * as TSL from 'three/tsl';
import * as t3 from '@typegpu/three';
import { fract } from 'typegpu/std';

const material1 = new THREE.MeshBasicNodeMaterial();
const pattern = TSL.texture(detailMap, TSL.uv().mul(10));
// `fromTSL` can be used to access any TSL node from a TypeGPU function
const patternAccess = t3.fromTSL(pattern, d.vec4f);
material1.colorNode = t3.toTSL(() => {
  'use gpu';
  return patternAccess.$;
});

const material2 = new THREE.MeshBasicNodeMaterial();
material2.colorNode = t3.toTSL(() => {
  'use gpu';
  // Many builtin TSL nodes are already reexported as `accessors`
  const uv = t3.uv().$;

  if (uv.x < 0.5) {
    return d.vec4f(fract(uv.mul(4)), 0, 1);
  }

  return d.vec4f(1, 0, 0, 1);
});
```
