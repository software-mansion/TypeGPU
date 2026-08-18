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

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).
