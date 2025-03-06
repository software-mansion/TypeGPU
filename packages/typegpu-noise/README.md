<div align="center">

# @typegpu/noise

🚧 **Under Construction** 🚧

</div>

A set of noise/pseudo-random functions for use in WebGPU/TypeGPU apps.

```ts
import { setSeed, rand } from '@typegpu/noise';

const timeBuffer = root.createBuffer(f32).$usage('uniform');
const timeUniform = timeBuffer.as('uniform');

const main = tgpu
  .fragmentFn({ pos: builtin.position }, vec4f)
  .does(({ pos }) => {
    const time = timeUniform.value;
    setSeed(add(pos.xy, vec2f(time)));

    const val = rand.float01(); // => number
    const normal = rand.onUnitSphere(); // => v3f
    const dir = rand.inUnitCircle(); // => v2f
  });

```