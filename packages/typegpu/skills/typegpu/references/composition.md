# Composing and configuring shaders

How to structure shader code so it can be reused, specialized and bound to different resources. Language rules are in `references/shaders.md`.

Docs: https://docs.swmansion.com/TypeGPU/apis/slots.md, https://docs.swmansion.com/TypeGPU/apis/accessors.md

## Define shaders before allocating resources

Schemas, bind group layouts, slots, accessors and shader functions don't need a root. Define them at module scope and bind concrete resources when creating pipelines:

```ts
const gain = tgpu.accessor(d.f32);
const shade = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
  'use gpu';
  return d.vec4f(uv * gain.$, 0, 1);
});

function createPreview(root: TgpuRoot, format: GPUTextureFormat) {
  const value = root.createUniform(d.f32, 1);
  const pipeline = root.with(gain, value).createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: shade,
    targets: { format },
  });
  return { value, pipeline, destroy: () => value.buffer.destroy() };
}
```

The shader owns no GPU resources, so it can be resolved and tested without a device (see `references/debugging.md`). The function that allocates resources returns them together with their cleanup. Capturing fixed resources (`root.createUniform` and friends) directly in a shader is still fine when shader and resource belong to one local operation; don't wrap every definition in a factory just to pass a root around.

Choose the tool by what varies:

| What varies | Use |
|---|---|
| Local variation decided by the host | A plain `'use gpu'` callback or a function returning one |
| A dependency deep in the shader graph | `tgpu.slot` |
| A schema-typed value that may come from a buffer, constant or function | `tgpu.accessor` |
| A value that changes at runtime | A uniform or storage buffer, read through an accessor |

## Slots

`tgpu.slot<T>()` is a typed placeholder; fill with `.with(slot, value)` at root scope (before pipeline creation) or function scope — pipelines do not accept slots in `.with()`. Any type fits: GPU values, functions, callbacks. Slots are the idiomatic way to build configurable/reusable shaders.

```ts
const distFnSlot = tgpu.slot<(pos: d.v3f) => number>();

const rayMarcher = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const dist = distFnSlot.$(d.vec3f(gid)); // call the injected function
});

root
  .with(distFnSlot, (pos) => {
    'use gpu';
    return std.length(pos - d.vec3f(0, 0, -5)) - 1; // sphere SDF
  })
  .createComputePipeline({ compute: rayMarcher });
```

Scalar/vector slot with a default:

```ts
const colorSlot = tgpu.slot(d.vec4f(1, 0, 0, 1));
root.with(colorSlot, d.vec4f(0, 1, 0, 1)).createRenderPipeline({ /* ... */ });
```

A `tgpu.fn` (shelled, or wrapping a `'use gpu'` callback) takes `fn.with(slot, value)` and `fn.pipe(transform)`, each returning a configured copy. Both also run inside `'use gpu'` code, so a shader can call a specialized variant in place:

```ts
const factor = tgpu.slot(1);
const scale = tgpu.fn((v: number) => {
  'use gpu';
  return v * factor.$;
});

const main = tgpu.fn([d.f32], d.f32)((x) => {
  'use gpu';
  return scale.with(factor, 2)(x) + scale.with(factor, 3)(x);
});
```

Each distinct set of bindings resolves to its own WGSL function. Entrypoints (`computeFn`, `vertexFn`, `fragmentFn`) have no `.with`; they get their values from `root.with(...)` / `root.pipe(...)`.

## Accessors

`tgpu.accessor(schema, initial?)` is schema-aware - the value can be a buffer binding, a constant, a literal, or a `'use gpu'` function returning one. The shader is agnostic about how the value is sourced. If they can be cleanly used, they should be preferred over slots.

```ts
const colorAccess = tgpu.accessor(d.vec3f);

// Fill with a uniform buffer:
root.with(colorAccess, colorUniform).createComputePipeline({ compute: kernel });

// Fill with a literal (inlined):
root.with(colorAccess, d.vec3f(1, 0, 0)).createComputePipeline({ compute: kernel });

// Fill with a GPU function:
root.with(colorAccess, () => { 'use gpu'; return computeColor(); }).createComputePipeline({ compute: kernel });
```

A plain arrow without `'use gpu'` (`() => layout.$.color`, `() => particles.$[0].color`) runs during code generation and inlines the resource expression it returns; a `'use gpu'` function becomes a WGSL function call. Other accepted values: a bind group layout entry (`() => layout.$.entry`, a common default), a `tgpu.privateVar` / `tgpu.workgroupVar`, a `tgpu.const`, and texture views for texture schemas (`tgpu.accessor(d.texture2d(d.f32))`). A runtime-sized schema (`tgpu.accessor(d.arrayOf(d.f32))`) accepts an array of any length, including a JS array literal.

Write access: `tgpu.mutableAccessor(schema, initial?)`. Fill it with something writable: a `root.createMutable` binding (or a field of one, `() => ctx.$.counter`), a mutable storage layout entry, a `tgpu.privateVar` / `tgpu.workgroupVar`, or a storage texture. Uniforms, readonly buffers, constants and function results throw at resolution; read those through `tgpu.accessor`.

An accessor can also be filled with an immediate (`tgpu['~unstable'].immediateVar`) for per-draw values without buffers. Immediates are Chromium-only for now, so keep a uniform fallback; see `references/encoders.md`.

### Project shared parameters through accessors

```ts
const gain = tgpu.accessor(d.f32);
const Params = d.struct({ gain: d.f32, offset: d.f32 });
const params = root.createUniform(Params, { gain: 1, offset: 0 });
const configured = root.pipe((cfg) => cfg.with(gain, () => params.$.gain));
// Pipelines created from `configured` read gain.$ from the uniform.
params.patch({ gain: 2 });
```

The accessor picks a source at resolution time; patching the uniform changes the data without changing that choice. A transform `(cfg: Configurable) => cfg.with(...)` groups repeated `.with` calls; apply it with `root.pipe(t)` for pipelines or `fn.pipe(t)` for a single function (`Configurable` is a type export of `typegpu`).

## Compose callbacks

```ts
type Field = (p: d.v2f) => number;

function blendFields(a: Field, b: Field, weight: number): Field {
  return (p) => {
    'use gpu';
    return std.mix(a(p), b(p), weight);
  };
}
```

The host picks the callbacks and the weight at resolution time, so `weight` is inlined as a constant. A weight that changes per frame belongs in a buffer.

### Emit only the selected terms

```ts
const terms = tgpu.slot<readonly ((x: number) => number)[]>([baseTerm]);

const evaluate = tgpu.fn([d.f32], d.f32)((x) => {
  'use gpu';
  let sum = d.f32(0);
  for (const term of tgpu.unroll(terms.$)) {
    sum += term(x);
  }
  return sum;
});

const withExtra = evaluate.with(terms, [baseTerm, extraTerm]);
```

Each term list resolves to its own WGSL variant, and resources used only by an excluded term are not bound. Keep lists short: every combination is a separate shader to compile. Use GPU arrays for large populations.

### Derive a schema per specialization

```ts
const width = tgpu.slot(2);
const Vector = tgpu.lazy(() => d.arrayOf(d.f32, width.$));
// Inside a 'use gpu' function: const v = Vector.$();
```

`tgpu.lazy` evaluates once per resolution with the active slot bindings, so binding `width` to 2 and to 5 yields two array schemas. `Vector.with(width, 8)` carries a binding into the computation. Create lazy objects at module scope: creating one during resolution throws.

## Schema-typed producers

When several operations share a source of values, pass the schema along with the GPU accessor function, so consumers keep the type:

```ts
interface Source<S extends d.AnyWgslData> {
  readonly schema: S;
  readonly count: number;
  at: (index: number) => d.InferGPU<S>;
}

function mapSource<A extends d.AnyWgslData, B extends d.AnyWgslData>(
  source: Source<A>,
  schema: B,
  map: (value: d.InferGPU<A>) => d.InferGPU<B>,
): Source<B> {
  return {
    schema,
    count: source.count,
    at: (index) => {
      'use gpu';
      return map(source.at(index));
    },
  };
}
```

A mapped source allocates nothing; the work runs in each consumer. Materialize it into a storage buffer (one compute pass writing `at(i)` for every index) when several consumers read it, and expose the buffer through the same `Source` interface (`at: (i) => { 'use gpu'; return stored.$[i]; }`). The stored adapter sees later writes to that buffer; it is not a snapshot.

To transform a record without modifying the input, copy it first:

```ts
const shifted = (value: d.Infer<typeof Particle>, offset: d.v2f) => {
  'use gpu';
  const result = std.copy(value);
  result.position += offset;
  return result;
};
```
