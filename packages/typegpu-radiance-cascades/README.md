<div align="center">

# @typegpu/radiance-cascades

</div>

2D lighting for TypeGPU. Describe the scene with a signed distance function and
an emitted-light function, then sample the resulting lighting texture.

```ts
import { createRadianceCascades } from '@typegpu/radiance-cascades';

const runner = createRadianceCascades({
  root,
  size: { width, height },
  sdfResolution: { width: sdfWidth, height: sdfHeight },
  sdf: (uv) => {
    'use gpu';
    return sampleSdf(uv);
  },
  emission: (uv) => {
    'use gpu';
    return sampleEmission(uv);
  },
});

runner.run();
```

Scene callbacks receive UV coordinates from 0 to 1. `sdf(uv)` returns signed
distance, with the shorter side of the scene measuring 1. `emission(uv)` returns
emitted light in linear RGB; return zero for a non-emitting obstacle.
`sdfResolution` is the distance-texture size, or the desired surface-detail
resolution for an analytic SDF.

Call `run()` after changing the scene and sample `runner.output` in your rendering
shader. Call `destroy()` when the runner is no longer needed.

See the [guide](https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-radiance-cascades/)
for image-based scenes, output ownership, batched updates and quality settings.

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).
