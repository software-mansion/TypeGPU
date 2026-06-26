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

`run()` batches all cascade passes and the final radiance-field build into one
command buffer. Pass your own encoder to batch it with surrounding work:

```ts
const encoder = root.device.createCommandEncoder();
runner.run(encoder);
root.device.queue.submit([encoder.finish()]);
```

## Scene contract

The default marcher expects `sdf(uv)` to return a signed distance in
short-axis-normalized UV units:

- positive outside geometry
- negative inside geometry
- zero on the blocking or emitting surface

`color(uv)` should return linear radiance/emission. If the source texture is
sRGB-like, linearize it before returning from `color`.

## Quality and memory options

```ts
const runner = createRadianceCascades({
  root,
  size: { width, height },
  sdfResolution,
  sdf,
  color,

  // Direction density in the base cascade. 2 matches the classic default.
  baseStoredRayDim: 2,

  // hardware keeps the single filtered upper sample. bilinear-fix forks toward
  // the four upper probes before merging.
  mergeMode: 'bilinear-fix',

  // Two active 2D ping-pong cascade textures are used by default. Enable this
  // only when you need to inspect every cascade layer after a run.
  keepCascadeLayers: false,

  erodeBiasPx: 1,
  epsPx: 0.25,
  minStepPx: 0.125,
  maxRaySteps: 64,
  stepSafety: 1,
  intervalOverlapPx: 0,
});
```

Available merge modes are:

- `'hardware'`
- `'bilinear-fix'`

`intervalOverlapPx` may also be set to `'upperProbeSpacing'` to use each
layer's upper-probe spacing as the overlap amount.

If you provide an output texture view, `runner.output` is that view. When the
runner owns or can prove it has a sampled texture, `runner.outputTexture` is
also available for creating sampled views.
