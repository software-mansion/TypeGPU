# `@typegpu/radiance-cascades` - 2D global illumination

Turns a scene description into a lighting texture you sample in your own shader. Full guide: <https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-radiance-cascades.md>. Create runners with `create`; `createRadianceCascades` is its deprecated alias.

## Choose a runner

| Scene | Runner |
| --- | --- |
| Raster grid, thin occluders, fog or smoke, coloured glass | `hrc.create` from `@typegpu/radiance-cascades/holographic` |
| Analytic shapes, generated distance field, custom ray marching | `rc.create` from `@typegpu/radiance-cascades` |

The holographic runner reads a per-pixel medium and needs no distance function.
The SDF runner treats surfaces as opaque unless a custom `rayMarch` says otherwise.
Neither provides reflection or refraction.

## Describe a holographic medium

```ts
import * as hrc from '@typegpu/radiance-cascades/holographic';

const runner = hrc.create({
  root,
  size: { width: 512, height: 512 },
  medium: (pixel) => {
    'use gpu';
    const material = std.textureLoad(materialView.$, pixel, 0);
    return { emission: material.rgb, extinction: material.a };
  },
});
```

`materialView` is a sampled `rgba16float` view that the application rasterizes
the scene into. The runner evaluates `medium` many times per pixel, so read a
texture rather than evaluating many shapes in the callback. `pixel` is a `d.v2u`.

Emission is linear radiance added per pixel of travel. Extinction is in inverse
pixels: `16` is opaque in practice, `0` is empty. An opaque emitter appears with
radiance `emission / extinction`. Use finite values; infinity is not treated as
opaque. `transmission: 'rgb'` makes extinction a `d.v3f`; for transmission `T`
through `s` pixels use `-log(T) / s` per channel.

For scattering, add `source: (pixel, incident) => ...` and call
`run({ iterations })`. Each iteration adds one bounce and every run starts from
darkness. Isotropic scattering adds the coefficient to `extinction` and returns
`coefficient * incident` from `source`. The runner does not conserve energy.
Neither callback may read `runner.output` or `runner.sectors`.

## Describe an SDF scene

```ts
import * as rc from '@typegpu/radiance-cascades';

const runner = rc.create({
  root,
  size: { width: 512, height: 512 },
  sdfResolution: { width: 1024, height: 1024 },
  sdf: sceneSdf,
  emission,
});
```

`sceneSdf` and `emission` take `uv` in [0, 1]. Distances use the shorter side as
the unit, so 10 px in a 1024 × 512 scene is `10 / 512`. Emission is linear RGB
light, not material colour, and may exceed 1. `sdfResolution` sets the hit
tolerance and minimum step; it allocates nothing. Set `renderAspect` when the
lighting texture's aspect differs from the scene's. For drawn scenes, generate
the distance and colour textures with `sdf.createJumpFlood` from `@typegpu/sdf`
and sample them in both callbacks. A caller-supplied `output` (storage and
sampled) stays owned by the caller.

## Record into the frame

```ts
const encoder = root.createCommandEncoder();
const pass = encoder.beginComputePass();
producer.with(pass).dispatchWorkgroups(64, 64);
runner.run({ pass });
pass.end();
encoder.submit();
```

The two runners record differently:

| Runner | Recording call |
| --- | --- |
| Holographic | `run({ encoder })` or `run({ pass })`; raw WebGPU encoders and passes also work |
| SDF | `run(encoder)` with a typed `TgpuCommandEncoder`; it opens and ends its own compute pass |

With no argument, each submits standalone work. A supplied encoder is not
submitted and a supplied pass is not ended. Call `run` only when inputs read by
the scene callbacks change; the lighting texture persists between frames. If a
callback reads through an explicit bind group layout, record with the runner
returned by `runner.with(bindGroup)`. Captured views, samplers and accessors are
bound automatically.

A new size or configuration needs `destroy()` and a new runner. When the new
runner is prepared with `initAsync`, keep the old one until the new one is ready
(see "Replacing size-dependent state" in `references/pipelines.md`).

## Consume the light

```ts
const lightView = runner.output.createView(d.texture2d());

// In the display fragment, with the same uv as the scene:
const scene = std.textureSampleLevel(sceneView.$, sampler.$, uv, 0);
const light = std.textureSampleLevel(lightView.$, sampler.$, uv, 0).rgb;
return d.vec4f(scene.rgb + light * (1 - scene.a), 1);
```

`output` is linear HDR `rgba16float`; tone-map or scale it before a unorm target.
The holographic runner also exposes `sectors`, a four-layer array (+X, +Y, −X, −Y,
with +Y pointing down) for shading by surface normal:
`runner.sectors.createView(d.texture2dArray())`. The runner owns both textures.

## Cost

Holographic memory grows as `O(N² log N)`: about 38 MiB at 512², 160 MiB at
1024² and 672 MiB at 2048² for scalar transmission with no source. RGB
transmission and a source add to that; `runner.byteSize` reports the exact figure.
`tracedLevels` (default 3) trades medium reads for fewer approximate joins at the
same memory.

The SDF runner's `size` can be smaller than the canvas. Each step of
`baseStoredRayDim` doubles internal textures per axis; at `4`, a lighting texture
with a 4096 px diagonal exceeds the default 8192 texture limit. `mergeMode:
'bilinear-fix'` reduces leaking around obstacles at extra cost over the default
`'hardware'`.
