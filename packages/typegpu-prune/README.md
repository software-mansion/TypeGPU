# @typegpu/prune

> Work in progress.

Write TypeGPU as usual, mark the parts to compile at build time with `precompile()`, and ship
WGSL, layouts and generated buffer codecs instead of TypeGPU.

```ts
import { tgpu, d } from 'typegpu';
import { init, precompile } from '@typegpu/prune';

const sim = precompile((root) => {
  const Params = d.struct({ speed: d.f32 });
  const params = root.createUniform(Params, { speed: 1 });
  // ... shaders, layouts
  // Targets without a format use the preferred canvas format, picked at runtime
  const render = root.createRenderPipeline({ /* ... */ });
  return { Params, params, render };
});

const root = await init();
const gpu = sim(root);
gpu.params.write({ speed: 2 });
```

- **In dev** (or without the plugin), the arrow runs at runtime on full TypeGPU.
- **In a precompiling build**, the plugin evaluates the arrow in Node, replaces the call with the
  result, and points `@typegpu/prune` imports at `@typegpu/prune/runtime`.

## Rules for the arrow

- It may use imports, and module-level constants with literal values.
- Schemas, layouts and shader functions are defined inside of it, or imported.
- It receives only the root. Settings known only at runtime are precompiled as variants and
  picked from at runtime. Variants share their WGSL.
- The canvas format is the exception: render pipeline targets without a `format` use
  `navigator.gpu.getPreferredCanvasFormat()` at runtime, like in TypeGPU. Calling it inside of the
  arrow is an error.
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
