## Shader generation

Render pipelines are resolved twice through a stand-in WebGPU root, once per shader stage, with a
`GlslGenerator` for each. Both generators share a `CrossShaderStageState`, which is how the stages
agree on names (uniforms, varyings), and how the generators hand information over to the root:

- `vertexInputs`: the GLSL identifier and location of every vertex input, keyed by the IO schema
  property it represents. Every input is declared with an explicit `layout(location=N)` (the
  location TypeGPU assigned to it), and the root binds vertex attributes to those locations, so no
  `getAttribLocation` lookups are needed.
- `fragmentOutputs`: the locations of the fragment outputs, which select their draw buffers.
- `varyingQualifiers`: interpolation qualifiers decided on the vertex side (e.g. `flat` for
  integers), so that the fragment side declares matching inputs.

## Resource management

Buffers keep a CPU-side copy of their data, which is the source of truth: the GPU never writes into
buffers in WebGL 2 (there are no storage buffers or transform feedback), so reads and copies are CPU
operations. GL buffers are created and updated lazily, when a draw uses them.

Uniforms are views of buffers (`root.createUniform()` creates a buffer and returns
`buffer.as('uniform')`), like in the WebGPU root, but they don't use GL buffers (uniform blocks).
Instead, each pipeline plans how to upload them with `gl.uniform*()` calls, one per GLSL uniform
location (struct members and arrays of structs have their own locations), and only uploads them
again when their buffer changed.

For apps that want to optimize the non-fallback path, it's easy to do with accessors, for example:

```ts
const root = await initWithGLFallback();
const isGL = isGLRoot(root);

const Positions = d.arrayOf(d.vec3f, 64);
const positions = isGL ? root.createUniform(Positions) : root.createReadonly(Positions);

function updatePosition(index: number) {
  'use gpu';
  positions.$[index] += d.vec3f(0, 1, 0);
}
```

## Drawing

Pipelines are immutable: `with*` methods return new pipelines, which share the compiled program
and bindings (the pipeline's _core_), and have their own _state_ (attachments, buffers).

All pipelines share one GL context, so every draw sets all of the state a pipeline could have
changed, whether the pipeline uses it or not. The objects that depend on more than one resource
are cached by the root:

- `VertexArrays`: one VAO per pipeline and combination of vertex and index buffers.
- `RenderTargets`: one framebuffer per combination of attachments.

Both release their objects when the resources they reference are destroyed.

Canvas targets are rendered into the default framebuffer of the context's canvas. Unless that's the
target canvas itself, the result is copied onto the target canvas through an `ImageBitmap`, once
per task, since transferring resets the drawing buffer (see `CanvasPresenter`).
