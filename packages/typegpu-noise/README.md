<div align="center">

# @typegpu/noise

🚧 **Under Construction** 🚧

</div>

A set of noise/pseudo-random functions for use in WebGPU/TypeGPU apps.

```ts
import { setSeed, rand } from '@typegpu/noise';

const timeUniform = root.createUniform(f32);

const mainFrag = tgpu
  .fragmentFn({ in: { pos: builtin.position }, out: vec4f })
  .does((input) => {
    const time = timeUniform.value;
    setSeed(add(input.pos.xy, vec2f(time)));

    const val = rand.float01(); // => number
    const normal = rand.onUnitSphere(); // => v3f
    const dir = rand.inUnitCircle(); // => v2f
  });

```