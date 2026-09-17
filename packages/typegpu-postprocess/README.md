# @typegpu/postprocess

Post-processing stacks written in TypeGPU. Pixel-local transforms automatically
fuse into the preceding pass, removing intermediate texture writes and draws.

```ts
import { d } from 'typegpu';
import * as post from '@typegpu/postprocess';

const stackLayout = post.createStackLayout([
  post.separableGaussianBlur({ radius: 3, sigma: 1.5 }),
  post.oneToOnePass((color: d.v4f) => {
    'use gpu';
    return d.vec4f(color.rgb * 1.2, color.a);
  }),
  post.acesToneMapping(),
]);
const stack = stackLayout.instantiate({ root, input: sceneTexture });
// Two draws: horizontal blur, then vertical blur + grading + ACES.
console.log(stack.passCount);

const size = stack.outputSize;
if (size === 'adapt') throw new Error('Choose a destination size for adaptive layouts.');
const output = root.createTexture({
  size: [size[0], size[1]],
  format: 'rgba16float',
}).$usage('render', 'sampled');

stack.render({ output });
// Present or sample `output` using your own pipeline.
stack.input = nextSceneTexture;
stack.render({ output });

stack.destroy(); // Releases only intermediate textures.
output.destroy(); // Caller owns input and output lifetimes.
```

Configure `unplugin-typegpu` in your application to transform your `'use gpu'`
callbacks. The published library's own callbacks are already transformed.

## Layouts, instances, and resources

`createStackLayout(passes)` describes a reusable pipeline and plans fusion.
`stackLayout.instantiate({ root, input, format? })` creates an independent stack.
`format` controls intermediate textures and defaults to `rgba16float`; it can
also be `rgba32float`, `rgba8unorm`, or `bgra8unorm`. The final render pipeline
uses the caller's output texture format.

Assigning `stack.input` validates the input and immediately updates `outputSize`.
The next render replaces bindings and resizes affected intermediate textures as
needed. Existing pipelines survive size changes. Reusing textures reuses their
bind groups and views; the final pipeline is cached per destination format.
Changing a texture's contents needs no reassignment.

Inputs must be sampled, single-sampled 2D float color textures. Outputs must be
renderable, single-sampled 2D float color textures. Input and output must be
distinct. `render({ output })` checks the destination dimensions and throws an
`Error` on mismatch, before recording any draws. The caller must recreate their
output when `outputSize` changes, unless the layout ends in an adaptive resampler.

`render({ output, encoder })` records into a caller-owned TypeGPU command encoder
without submitting it. Omitting `encoder` submits the entire stack in one command
buffer. Submit caller-owned encoders before resizing inputs, switching input
type, or destroying the stack. `destroy()` is idempotent; rendering or assigning input after destruction
throws. Input and output textures are never destroyed by the stack.

An empty layout copies the input into the output in one draw. Layout `passCount`
counts fused stages; instance `passCount` additionally counts external import.

## External textures (video)

Pass an external texture together with its dimensions, and supply a valid imported
texture for each render. The size descriptor is snapshotted on assignment.

```ts
const stack = stackLayout.instantiate({
  root,
  input: {
    texture: root.device.importExternalTexture({ source: video }),
    size: [video.videoWidth, video.videoHeight],
  },
});

// In each video-frame callback, after metadata/dimensions are available:
stack.input = {
  texture: root.device.importExternalTexture({ source: video }),
  size: [video.videoWidth, video.videoHeight],
};
stack.render({ output });
```

External input adds a conversion draw into an ordinary 2D intermediate texture.
This preserves the `texture_2d<f32>` contract of custom passes. Its pipeline and
texture are reused; the external bind group is refreshed on every render because
external textures have frame-dependent lifetimes. Switching between regular and
external inputs does not rebuild the effect pipelines.

## Passes and fusion

- `oneToOnePass((color: d.v4f) => d.v4f)` operates on one pixel, preserves
  dimensions, and promises no other texture reads or GPU side effects. It may
  capture uniforms and other read-only parameters.
- `standalonePass({ callback: (texture, uv) => d.v4f, size? })` starts a render
  pass. UVs are normalized with origin at the top left. `size` can be a tuple or
  a CPU function receiving the preceding dimensions; omit it to preserve size.
- `PassGroup` bundles multiple stages as one stack item, as used by separable blurs.

Following one-to-one callbacks fuse into the preceding stage, including a blur or
resize, and execute in declaration order. A leading run gets its own draw. The
constructors declare this contract; the library does not prove shader purity.
Fusion skips intermediate format conversion, so results can differ slightly from
executing each transform through a separate texture.

`loadPixel(texture, uv)` reads mip zero with nearest-neighbor sampling and clamped
edges. Bindings use `unfilterable-float`, including support for `rgba32float`
without optional filtering features. Use `textureLoad` or a non-filtering sampler
in custom passes.

## Resampling

```ts
const stackLayout = post.createStackLayout([
  post.resampleNearest([320, 180]),
  post.separableGaussianBlur({ radius: 4 }),
  post.acesToneMapping(),
  post.resampleBilinear('adapt'),
]);
```

`resampleNearest`, `resampleBilinear`, and `resampleBicubic` accept either a size
tuple or `'adapt'`. The equivalent options-object form is `{ size: [w, h] }` or
`{ size: 'adapt' }`. `resampleBiliear` is an alias for `resampleBilinear`, retaining
the originally proposed spelling.

Fixed sizes determine `stack.outputSize`. An `'adapt'` pass must be the **last
pass**, including within groups; even a following one-to-one pass is rejected.
In that case `outputSize` is `'adapt'`, and the render destination determines the
final size. Intermediate stages retain their own dimensions.

Resamplers use clamped mip-zero reads. Bilinear interpolation uses four reads;
bicubic uses a 16-tap Catmull–Rom kernel and may overshoot the input color range.
These are reconstruction filters, not area filters for large downsampling ratios.

## Built-in effects

| Factory | Behavior |
| --- | --- |
| `singlePassGaussianBlur({ radius?, sigma? })` | Normalized square Gaussian kernel, one draw |
| `separableGaussianBlur({ radius?, sigma? })` | Horizontal and vertical Gaussian convolution, two draws |
| `singlePassBoxBlur({ radius? })` | Normalized square uniform kernel, one draw |
| `separableBoxBlur({ radius? })` | Horizontal and vertical box convolution, two draws |
| `bokehBlur({ radius? })` | Normalized circular aperture kernel, one draw |
| `reinhardToneMapping()` | `rgb / (1 + rgb)` |
| `acesToneMapping()` | Narkowicz ACES fit, clamped to [0, 1] |
| `exposureToneMapping(exposure = 1)` | `1 - exp(-rgb * exposure)` |

Blur radius defaults to 2, and Gaussian sigma to `max(radius / 2, 0.5)`.
Single-pass Gaussian and box blur use `(2r + 1)²` reads per pixel; separable blur uses
`2 * (2r + 1)` across two draws, with intermediate rounding. Both clamp edges
and average RGBA. Following color transforms fuse into the final blur stage.
Radius zero is identity; separable variants still execute two stages.
Use premultiplied colors when blurring transparent images.

Bokeh blur averages the pixel centers inside a disk (`x² + y² ≤ radius²`),
producing circular highlights from bright points. It uses approximately `πr²`
texture reads per pixel and is not separable. Like the other blurs, it clamps
edges, averages RGBA, preserves size, and becomes identity at radius zero.
It applies a uniform defocus to the whole image; it does not use scene depth.
Use linear HDR input and apply tone mapping afterward to retain bright highlights.

```ts
post.bokehBlur({ radius: () => settings.$.effects.blur.radius });
```

Tone curves clamp negative RGB to zero and preserve alpha. They expect linear
RGB and do not perform sRGB encoding or unpremultiplication.

## Dynamic radius

All blur factories accept `TgpuAccessor.In<d.I32>`: numeric constants, `i32`
uniforms, or callbacks selecting nested resource values:

```ts
post.separableGaussianBlur({ radius: () => settings.$.effects.blur.radius });
```

Plain callbacks run during shader resolution to obtain the resource reference;
the shader reads the current uniform value at runtime. Use `'use gpu'` when
computing a radius with shader-side operations. Internally, `tgpu.accessor`
specializes constants while uniform inputs change loop bounds without rebuilding.
Dynamic radii clamp to [0, 64]; invalid numeric constants throw immediately.
The default sigma follows the clamped radius; explicit sigma remains constant.

## Migration

Replace `createPostprocessStack(passes).build(root, { input })` with
`createStackLayout(passes).instantiate({ root, input })`. Replace reads of
`renderer.output` with your own output texture created from `stack.outputSize`,
and call `stack.render({ output, encoder? })`. The stack no longer owns a final
output texture.
