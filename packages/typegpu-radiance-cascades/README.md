<div align="center">

# @typegpu/radiance-cascades

</div>

A helper library for computing 2D radiance cascades with TypeGPU.

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
  color: (uv) => {
    'use gpu';
    return sampleColor(uv);
  },
});

runner.run();
```
