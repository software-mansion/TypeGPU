<div align="center">

# @typegpu/three

🚧 **Under Construction** 🚧

</div>

A helper library for using TypeGPU with Three.js.

```ts
import * as TSL from 'three/tsl';
import { access, fromTSL, toTSL } from '@typegpu/three';
import { fract } from 'typegpu/std';

const material1 = new THREE.MeshBasicNodeMaterial();
const pattern = TSL.texture(detailMap, TSL.uv().mul(10));
// `fromTSL` can be used to access any TSL node from a TypeGPU function
const patternAccess = fromTSL(pattern, { type: d.vec4f });
material1.colorNode = toTSL(() => {
  'use gpu';
  return patternAccess.$;
});

const material2 = new THREE.MeshBasicNodeMaterial();
material2.colorNode = toTSL(() => {
  'use gpu';
  // Many builtin TSL nodes are already reexported as `accessors`
  const uv = access.uv().$;

  if (uv.x < 0.5) {
    return d.vec4f(fract(uv.mul(4)), 0, 1);
  }

  return d.vec4f(1, 0, 0, 1);
});
```
