<div align="center">

# @typegpu/sdf

</div>

A set of signed distance functions and utilities for use in WebGPU/TypeGPU apps.

```ts
import { tgpu, d } from 'typegpu';
import * as sdf from '@typegpu/sdf';

const mainFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const distance = sdf.opSmoothUnion(
    sdf.sdDisk(uv.sub(0.5), 0.25),
    sdf.sdBox2d(uv.sub(0.5), d.vec2f(0.8, 0.05)),
    0.1,
  );

  if (distance < 0) {
    return d.vec4f(0, 0, 0, 1);
  }
  return d.vec4f(1, 1, 1, 0);
});
```

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).
