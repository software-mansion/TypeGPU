<div align="center">

# @typegpu/dispatch

🚧 **Under Construction** 🚧

</div>

This package contains a utility `dispatch` function for use in WebGPU apps.
Requires [unplugin-typegpu](https://www.npmjs.com/package/unplugin-typegpu) to
work.

`dispatch` simplifies running one-and-done computations on the GPU. Behind the
scenes, `dispatch` transpiles the given function to WGSL, compiles it into a
compute shader module, creates a pipeline and runs it, all while making sure
that all referenced resources are bound in automatically created bind groups.

Example usage would include filling out buffers with initial data to omit the
serialization overhead.

```ts
import dispatch from '@typegpu/dispatch';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();

const Boid = d.struct({
  index: d.u32,
  pos: d.vec3f,
});

// buffer of 2048 Boids
const boidsMutable = root.createMutable(d.arrayOf(Boid, 2048));

dispatch(root, [2048], (x) => {
  // TGSL function body to run 2048 times on the GPU
  'kernel';
  const boidData = Boid({ index: x, pos: d.vec3f() });
  boidsMutable.$[x] = boidData;
});

// (optional) wait for the dispatch to finish
await root.device.queue.onSubmittedWorkDone();
```

Buffer initialization commonly uses random number generators. For that, you can
use the `@typegpu/noise` library.

```ts
import dispatch from '@typegpu/dispatch';
import { randf } from '@typegpu/noise';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();

// buffer of 1024x1024 floats
const waterLevelMutable = root.createMutable(
  d.arrayOf(d.arrayOf(d.f32, 1024), 1024),
);

dispatch(root, [1024, 1024], (x, y) => {
  'kernel';
  randf.seed((x * 1024 + y) / 1024 ** 2);
  waterLevelMutable.$[x][y] = randf.sample();
}, [16, 16]);

// (optional) read values in JS
console.log(await waterLevelMutable.read());
```

Do NOT use this package for:

- Kernel calls that occur multiple times, for example on every frame. Every
  `dispatch` call recreates the pipeline, which may impact the performance of
  your app significantly. Create and reuse a pipeline instead.

- Avoidable small calls. For example, small buffers can be initialized with
  `buffer.write()` method, or (when using TgpuBuffers) by passing the data to
  the constructor.
