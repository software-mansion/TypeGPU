<div align="center">

# @typegpu/three

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

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).
