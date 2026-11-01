# @typegpu/prune

> Work in progress. See the design document for the reasoning behind the API.

Write TypeGPU as usual, mark the parts to compile at build time with `precompile()`, and ship
WGSL, layouts and generated buffer codecs instead of TypeGPU.

```ts
import { tgpu, d } from 'typegpu';
import { init, precompile } from '@typegpu/prune';

const sim = precompile((root, rt: { format: GPUTextureFormat }) => {
  const Params = d.struct({ speed: d.f32 });
  const params = root.createUniform(Params, { speed: 1 });
  // ... shaders, layouts, pipelines
  return { Params, params, render: root.createRenderPipeline({ /* ... */ targets: { format: rt.format } }) };
});

const root = await init();
const gpu = sim(root, { format: navigator.gpu.getPreferredCanvasFormat() });
gpu.params.write({ speed: 2 });
```

- **In dev** (or without the plugin), the arrow runs at runtime on full TypeGPU.
- **In a precompiling build**, the plugin evaluates the arrow in Node, replaces the call with the
  result, and points `@typegpu/prune` imports at `@typegpu/prune/runtime`.

## Rules for the arrow

- It may use imports, and module-level constants with literal values.
- Schemas, layouts and shader functions are defined inside of it, or imported.
- Its second parameter holds values only known at runtime. They can only be used in settings that
  don't change the WGSL (e.g. target formats); anything else is a build error.
- It may return plain data, schemas, buffers, samplers, bind group layouts, bind groups, vertex
  layouts and compute, guarded compute, and render pipelines.
- `console.log` in shaders is compiled out.

## Setup

```ts
// vite.config.ts
import prune from '@typegpu/prune/vite';

export default { plugins: [prune()] };
```

The prune plugin runs unplugin-typegpu itself, so it replaces it in the config (pass its options
through `prune({ typegpu: { ... } })`).

Also available for Rollup, Rolldown, esbuild and webpack. Precompiling is on for `vite build`, and
otherwise when `NODE_ENV` is `production`; pass `{ precompile: true | false }` to override.
