<div align="center">

# @typegpu/three

🚧 **Under Construction** 🚧

</div>

A helper library for using TypeGPU with Three.js.

## API draft

- TSL nodes don't really have types associated with them.
- We can infer the return type of a node like in shell-less functions

```ts
import { fract } from 'typegpu/std';
import tgpu3, { uv } from '@typegpu/three';

const material = new THREE.MeshBasicNodeMaterial();
// We reexport builtin TSL nodes as `accessors`
material.colorNode = toTSL(() => {
  'use gpu';
  return fract(uv.$.mul(4));
});

// Users can also wrap custom TSL nodes and use them the same way
const pattern = TSL.texture(detailMap, TSL.uv().mul(10));
const patternAccess = fromTSL(pattern, { type: d.vec4f });
material.colorNode = toTSL(() => {
  'use gpu';
  return patternAccess.$;
});
```
