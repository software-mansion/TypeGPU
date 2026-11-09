# Checking and debugging TypeGPU code

## After every edit

1. **Type check** (`tsc --noEmit`, or the project's `types` script). Schemas carry types through buffers, layouts and shader signatures, so most wiring mistakes surface here. Operators on vectors (`a + b`, `v * 2`) typecheck only with `tsover` set up (see `references/setup.md`).
2. **Lint** with `eslint-plugin-typegpu` (in ESLint, or in oxlint as a JS plugin; the `check` script in projects created by the TypeGPU CLI runs it through oxlint). It flags `Math.*`, integer division, assignments to parameters and outer-scope variables, uninitialised variables, unwrapped object literals and unsupported syntax inside `'use gpu'` functions.
3. **Resolve the shaders** for anything beyond a small change. Resolution turns `'use gpu'` code into WGSL and reports the `ResolutionError`s that type checking can't see (references, literal types, unsupported syntax, unbound slots). It needs the build plugin but no GPU, so it runs in a plain vitest test:

```ts
// vitest.config.ts
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({ plugins: [typegpu()] });
```

```ts
// tests/shaders.test.ts
import { tgpu, d } from 'typegpu';
import { expect, test } from 'vitest';
import { gain, shade } from '../src/preview.ts';

test('preview shader resolves', () => {
  const wgsl = tgpu.resolve([shade], { config: (cfg) => cfg.with(gain, d.f32(1)) });
  expect(wgsl).toContain('@fragment');
});
```

`config` binds slots and accessors the way `root.with(...)` does when creating a pipeline. Pipelines enable WGSL extensions from the device's features; a standalone resolve of code using `f16` or subgroups needs `enableExtensions: ['f16']` (or `'subgroups'`), otherwise the `enable` line is missing. `tgpu.resolveWithContext` takes the same arguments and returns `{ code, usedBindGroupLayouts, catchall }`.

Outside vitest, a plain Node.js (22.15+) or Deno (2.8+) script can resolve shaders through the plugin's module hooks: a preload file with `import install from 'unplugin-typegpu/node'; install();`, then `node --import ./preload.mjs scripts/print-wgsl.ts`.

Shaders that capture fixed resources (`root.createUniform` and friends) need a device to resolve. Shaders defined without a root, reading layouts, slots and accessors, resolve anywhere; see `references/composition.md`.

A shader that resolves has valid TypeGPU semantics. WGSL validation and pipeline creation happen on the device, so run the app (or a browser test) to confirm those, and look at the output to confirm the result is right.

## Reading a `ResolutionError`

The message starts with `Resolution of the following tree failed:`, then lists the path from `<root>` down to the failing function, then the cause. Plain callbacks appear as `fn*:name(argTypes)`, which shows the specialization that failed (`fn*:foo(i32)` when a caller passed an integer where `f32` was meant). Some causes add a `Try ...` suggestion between `-----` lines.

Unsupported syntax (`var`, prefix `++i`, destructuring declarations, arrow functions inside the body) fails earlier, in the build plugin, with the file name.

| Message contains | Cause | Fix |
|---|---|---|
| `references cannot be assigned` | A vector, matrix, struct or array variable was assigned to a `let` or reassigned | Copy with its schema (`d.vec3f(v)`, `MyStruct(s)`) or use `const`. See `references/shaders.md` |
| `non-pointer arguments cannot be mutated` | A function wrote to its parameter | Return the new value, or take a pointer (`d.ref<T>`, `d.ptrFn`). See `references/shaders.md` |
| `uniform buffers cannot be mutated`, `readonly buffers cannot be mutated`, `immediate variables cannot be mutated`, `textures and samplers cannot be mutated`, `the left side is a constant`, `the left side is immutable` | A write to a uniform, readonly buffer, immediate, handle, `tgpu.const`, captured JS value or temporary | Use a mutable buffer, `tgpu.privateVar`, or a local copy |
| `cannot take a reference to a scalar value` | `d.ref(x)` on an existing scalar | Copy it, `d.ref(d.f32(x))`, or declare the scalar as `const x = d.ref(0)` |
| `Missing metadata for tgpu.fn function body`, `is not marked with the 'use gpu' directive` | The function has no `'use gpu'` directive, or `unplugin-typegpu` isn't applied to this file | Add the directive; check the bundler or vitest config includes the plugin (see Troubleshooting in `references/setup.md`) |
| `Expected function to have a single return type, got [i32, u32]` | `return` statements of different concrete types | Cast the outlier (`d.u32(x)`). See `references/types.md` |
| `No target type could be inferred for object` | An object literal where TypeGPU can't infer the struct | Wrap it in the schema: `MyStruct({ ... })` |
| `Missing value for` a slot or accessor | A slot or accessor without a default isn't bound | `root.with(slot, value)` before creating the pipeline, `fn.with(slot, value)` on a `tgpu.fn`, or `config` in `tgpu.resolve` |
| `Cannot unroll loop containing`, `loops only support std.range or iterables stored in variables` | `break`/`continue` inside `tgpu.unroll`, or an inline array in a runtime loop | See `tgpu.unroll` in `references/compile-time.md` and Iteration in `references/shaders.md` |
| `Switch statement cannot have non-trivial fallthrough` | A non-empty case without an unconditional `break`/`return`/`continue` | See `switch` in `references/shaders.md` |
| `Expression statements like '...;' are forbidden in WGSL` | A bare value, arithmetic, logical, array or object expression used as a statement | Assign or use the result, or remove the statement |
| `because of the Finite Math Assumption` | `Infinity` or `NaN` converted with a numeric schema (`d.f32(Infinity)`) | Use a finite sentinel (`3.4e38`) or a flag |
| `Unsupported data types: ...`, `Call '...' is invalid, the function expected ...` | Wrong argument count or types for a `std` function or `tgpu.fn` | Check the signature in `references/std.md` or the function's `.d.ts` |
| `Cannot access ... need to be part of a compute dispatch, draw call or simulation`, `.$ is inaccessible during normal JS execution` | A function reading a buffer, accessor or variable was called as plain JS | Run it in a pipeline; on the CPU use `.write()` / `.read()` |

Errors thrown when drawing, dispatching or creating a bind group, not during resolution: `Missing bind groups for layouts: '...'` (`MissingBindGroupsError`, add `.with(bindGroup)`), `Missing vertex buffers for layouts: '...'` (`MissingVertexBuffersError`, add `.with(vertexLayout, buffer)`), `Missing value for immediate variable '...'` (`MissingImmediatesError`), `Buffer '...' is not bindable as a uniform` (`NotUniformError`, add `.$usage('uniform')`). `ResolutionError`, `MissingSlotValueError` and these four classes are exported from `typegpu` for `instanceof` checks.

## Inspecting generated WGSL

`tgpu.resolve([pipelineOrFunction])` returns the full WGSL with dependencies. Use it to:

- check what a specialization emits, e.g. that an excluded term leaves no bindings behind (see `references/composition.md`);
- compare variants with a snapshot test (`expect(tgpu.resolve([fn])).toMatchSnapshot()`).

`console.log` inside `'use gpu'` functions of a pipeline prints once the submission finishes and the log buffer is read back (see `references/shaders.md`); `tgpu.resolve` alone ignores it. Remove it before measuring performance.

## Isolating a wrong image

After the pipeline validates, find the first stage that produces wrong data:

- Return a constant color from the fragment shader, then reintroduce the real expression piece by piece.
- Display an intermediate texture directly before adding the pass that consumes it.
- At the first wrong stage, check pass order, attachment `storeOp`, coordinate conventions (see `references/pipelines.md`), texture format, and inputs that weren't updated.

## Measuring

Use the timing APIs in `references/timing.md`. Measure pipeline initialization, CPU command recording, GPU passes and readback separately, at the same resolution and on the same device when comparing. A timing that isn't available is not zero. Judge shader changes by GPU time or compiler statistics, not by how the source looks (see `references/performance.md`).
