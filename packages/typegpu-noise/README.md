<div align="center">

# @typegpu/noise

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

Perlin noise can sample from a precomputed cache of gradients:

```ts
import { perlin3d } from '@typegpu/noise';

const cache = perlin3d.cache.defineAndInstantiate(root, {}, { size: d.vec3u(32) });

const pipeline = root
  .with(perlin3d.getJunctionGradientSlot, perlin3d.getCachedJunctionGradient)
  .createRenderPipeline({ ... }); // uses `perlin3d.sample(...)`

const encoder = root.createCommandEncoder();
const pass = encoder.beginComputePass();
cache.step(pass); // fills the cache, once
pass.end();
encoder.submit();

pipeline.with(cache.bindGroup).withColorAttachment({ view: context }).draw(3);
```

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).
