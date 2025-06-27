<div align="center">

# @typegpu/noise

🚧 **Under Construction** 🚧

</div>

A set of noise/pseudo-random functions for use in WebGPU/TypeGPU apps.

```ts
import { randf } from '@typegpu/noise';

const time = root.createUniform(f32);

const mainFrag = tgpu
  .fragmentFn({
    in: { pos: builtin.position },
    out: vec4f,
  })((input) => {
    randf.seed2(add(input.pos.xy, vec2f(time.$)));

    const val = randf.sample(); // => number
    const normal = randf.onUnitSphere(); // => v3f
    const dir = randf.inUnitCircle(); // => v2f
  });
```
