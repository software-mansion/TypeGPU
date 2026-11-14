# TypeGPU Textures

Docs: `https://docs.swmansion.com/TypeGPU/apis/textures.md`.

## Creating textures

```ts
const tex = root.createTexture({
  size:           [width, height],           // [w] | [w, h] | [w, h, depth]
  format:         'rgba8unorm',              // any GPUTextureFormat
  dimension?:     '1d' | '2d' | '3d',       // default: '2d'
  mipLevelCount?: number,                    // default: 1
  sampleCount?:   number,                    // default: 1 (4 for MSAA)
  viewFormats?:   GPUTextureFormat[],        // sRGB variants
});
```

## Usage flags

```ts
.$usage('sampled')   // TEXTURE_BINDING - read via textureSample/textureLoad
.$usage('storage')   // STORAGE_BINDING - read/write as storage texture
.$usage('render')    // RENDER_ATTACHMENT - render targets and image-source writes
.$usage('transient') // TRANSIENT_ATTACHMENT | RENDER_ATTACHMENT - attachments never read back
                     // (e.g. MSAA/depth intermediates); cannot combine with 'sampled'/'storage'
```

Multiple: `.$usage('sampled', 'render')`.

Escape hatch: `.$overrideFlags(GPUTextureUsage...)` replaces the inferred flags with raw WebGPU ones and marks the texture usable as sampled, storage and render (`$usage` after it throws).

---

## Writing data

```ts
// Image sources (require 'render' usage). Decode to ImageBitmap for portability;
// canvas, video, ImageData, HTMLImageElement and VideoFrame support varies by browser.
texture.write(imageBitmap);                     // sizes must match - throws otherwise
texture.write(imageBitmap, { fit: 'stretch' }); // resample into the target region (render-pass blit)
texture.write(tile, { origin: [128, 64], fit: 'clip' }); // 1:1 texel copy, overflow cut off
texture.write(imageBitmap, {                    // crop a source region into a destination region
  sourceOrigin: [16, 16], sourceSize: [128, 128], size: [256, 256], fit: 'stretch',
});
texture.write([layer0, layer1]);                // array/3D textures: one source per layer
await texture.writeAsync(blob, { fit: 'stretch' }); // decodes a fetched Blob for you

// Pack single channels from several images (omitted channels are left untouched):
common.writeChannels(material, {
  r: { source: roughnessMap, from: 'r' },
  g: { source: metalnessMap, from: 'r' },
});

// Raw binary data: ArrayBuffer, TypedArray, or DataView ('render' not needed).
// Bytes are copied verbatim in the texture's format layout (e.g. 4 bytes/pixel for rgba8unorm);
// the byte length must match the written region exactly.
texture.write(new Uint8Array([255, 0, 0, 255 /* ...one entry per pixel */]));
texture.write(mipData, 1);                                        // target mip level
texture.write(texelData, { mipLevel: 0, origin: [1, 1], size: [1, 1] }); // region
```

Image-write options also take `flipY`, `premultipliedAlpha`, `colorSpace` and `filter` (for `fit: 'stretch'`).

Compressed formats (`bc*`, `etc2-*`, `eac-*`, `astc-*`; each needs its device feature) take raw writes of the encoded blocks. The byte count follows the block layout, so a mip level whose size isn't a multiple of the block size is padded up to whole blocks, and an explicit region `size` must be a multiple of the block size.

---

## Mipmap generation

2D textures (every array layer) with a renderable float format; needs `'sampled'` and `'render'` usage. With `mipLevelCount: 1` the call is a warning and a no-op.

```ts
texture.generateMipmaps();           // all levels from level 0
texture.generateMipmaps(1);          // levels 2, 3, ... from level 1
texture.generateMipmaps(0, 4);       // levels 1, 2, 3 from level 0
```

---

## Copying and clearing

```ts
target.copyFrom(source);                    // same size and format
target.copyFrom(source, {                   // region / mip copy, same format
  sourceOrigin: [16, 16], origin: [128, 64], size: [32, 32], sourceMipLevel: 0, mipLevel: 0,
});

texture.clear();                // zeros, all mip levels
texture.clear(mipLevel);        // zeros, one mip level
texture.clear([0, 0.5, 0, 1]);  // fill with a color ('render' usage), optional mip level after it
```

Texture `write`, `copyFrom`, `clear` and `generateMipmaps` go to the queue immediately, ahead of any encoder still being recorded; none takes a command encoder. **Cleanup:** `texture.destroy()`.

---

## Texture views

Views expose a texture (or a subset) to shaders or render passes. A sampled or storage view is a fixed resource: `view.$` inside a shader binds it automatically, like `createUniform`. A layout entry also accepts the texture itself and creates the matching view.

### Sampled views

```ts
texture.createView()                           // default schema from the texture's dimension, format and sampleCount
texture.createView(d.texture2d(d.f32))
texture.createView(d.texture2d(d.u32))
texture.createView(d.texture2d(d.i32))

texture.createView(d.texture2dArray(d.f32))
texture.createView(d.textureCube(d.f32))
texture.createView(d.textureCubeArray(d.f32))
texture.createView(d.texture3d(d.f32))
texture.createView(d.textureMultisampled2d(d.f32))
texture.createView(d.texture1d(d.f32))
```

`d.texture2d()` and the other sampled schemas default to `d.f32`.

### Depth views

```ts
texture.createView(d.textureDepth2d())
texture.createView(d.textureDepth2dArray())
texture.createView(d.textureDepthCube())
texture.createView(d.textureDepthCubeArray())
texture.createView(d.textureDepthMultisampled2d())
```

### Storage texture views

```ts
texture.createView(d.textureStorage2d('rgba8unorm', 'write-only'))  // default access
texture.createView(d.textureStorage2d('rgba8unorm', 'read-only'))
texture.createView(d.textureStorage2d('rgba8unorm', 'read-write'))

// Also: d.textureStorage1d, d.textureStorage2dArray, d.textureStorage3d
```

### Render attachment view

```ts
const renderView = texture.createView('render');
const mipTarget  = texture.createView('render', { baseMipLevel: 2, mipLevelCount: 1 }); // render into one mip or layer
```

> Cache view handles at setup - `createView(...)` inline is fine for prototypes but raises GC pressure at scale.

### View descriptor (subset of texture)

```ts
texture.createView(d.texture2d(d.f32), {
  baseMipLevel?:    number,
  mipLevelCount?:   number,
  baseArrayLayer?:  number,
  arrayLayerCount?: number,
  format?:          GPUTextureFormat,   // the texture format or one of its viewFormats
  aspect?:          GPUTextureAspect,
  sampleType?:      'float' | 'unfilterable-float',
})
```

`d.f32` views bind as `'float'` by default, which only filterable formats satisfy. For an unfilterable format (`r32float`, `rgba32float` without the `float32-filterable` feature, or a depth texture read as `d.texture2d(d.f32)`), pass `sampleType: 'unfilterable-float'` on the view for fixed use, or on the layout entry for manual binding (`{ texture: d.texture2d(), sampleType: 'unfilterable-float' }`), and read it with `textureLoad` or a `'non-filtering'` sampler.

Example - bind a single layer of an array texture:

```ts
const arrayTex = root.createTexture({
  size: [256, 256, 4],
  format: 'rgba8unorm',
}).$usage('sampled');

const layout = tgpu.bindGroupLayout({ layer: { texture: d.texture2d() } });

const bindGroup = root.createBindGroup(layout, {
  layer: arrayTex.createView(d.texture2d(), { baseArrayLayer: 2, arrayLayerCount: 1 }),
});
```

---

## Samplers

```ts
const sampler = root.createSampler({
  addressModeU?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat',
  addressModeV?: ...,
  addressModeW?: ...,
  magFilter?:    'nearest' | 'linear',
  minFilter?:    'nearest' | 'linear',
  mipmapFilter?: 'nearest' | 'linear',
  lodMinClamp?:  number,
  lodMaxClamp?:  number,
  maxAnisotropy?: number,              // 1-16
});

// Comparison sampler (shadow mapping) - separate constructor, `compare` required:
const shadowSampler = root.createComparisonSampler({
  compare: 'less',                     // GPUCompareFunction
  magFilter: 'linear',
});
```

Both are fixed resources: use `sampler.$` directly in shaders, or pass the sampler as a bind group entry. In bind group layouts: `{ sampler: 'filtering' | 'non-filtering' | 'comparison' }`.

---

## Using textures in shaders

### Sampling function reference

| Function | Stages | Control flow | Mip selection |
|---|---|---|---|
| `std.textureSample` | Fragment only | Must be uniform | Auto (implicit derivatives) |
| `std.textureSampleLevel` | Any | Non-uniform OK | Explicit mip level |
| `std.textureSampleGrad` | Any | Non-uniform OK | Auto via explicit derivatives |

```ts
const color = std.textureSample(layout.$.tex, layout.$.samp, uv);       // fragment, uniform
const color = std.textureSampleLevel(layout.$.tex, layout.$.samp, uv, 0); // any stage
const color = std.textureSampleGrad(layout.$.tex, layout.$.samp, uv, ddx, ddy); // explicit grads
```

### Sampled texture in a bind group

```ts
const layout = tgpu.bindGroupLayout({
  tex:  { texture: d.texture2d(d.f32) },
  samp: { sampler: 'filtering' },
});
// Shader: std.textureSample(layout.$.tex, layout.$.samp, uv)
```

### Storage texture (read/write without sampler)

```ts
const layout = tgpu.bindGroupLayout({
  output: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') },
});
// Compute shader: std.textureStore(layout.$.output, coords, d.vec4f(r, g, b, 1));
```

### Depth comparison (shadow mapping)

```ts
const layout = tgpu.bindGroupLayout({
  shadowMap:     { texture: d.textureDepth2d() },
  shadowSampler: { sampler: 'comparison' },
});
// Shader: std.textureSampleCompare(layout.$.shadowMap, layout.$.shadowSampler, uv, refDepth)
// returns the comparison result in [0, 1]; fragment-only like textureSample,
// std.textureSampleCompareLevel works in any stage.
```

### External texture (video)

```ts
const layout = tgpu.bindGroupLayout({
  frame: { externalTexture: d.textureExternal() },
});
// Shader: std.textureSampleBaseClampToEdge(layout.$.frame, sampler.$, uv)

// Per frame: an imported video frame expires, so import it and create the bind group each frame
const group = root.createBindGroup(layout, {
  frame: root.device.importExternalTexture({ source: video }),
});
```

The same slot also accepts a sampled TypeGPU texture in `rgba8unorm`, `bgra8unorm` or `rgba16float` (bound as a view of its first mip level), a `d.texture2d(d.f32)` view, or a raw `GPUTexture`/`GPUTextureView`. One shader then serves video frames and still images.

---

## Render to a texture, then sample it

A two-pass effect bakes a field into an intermediate texture, then a second pass samples it. The intermediate needs both `'render'` and `'sampled'` usage:

```ts
const field = root
  .createTexture({ size: [256, 256], format: 'rgba16float' })
  .$usage('render', 'sampled');
const fieldView = field.createView(d.texture2d(d.f32));
const sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });

const bake = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
    'use gpu';
    return d.vec4f(0.5 + 0.5 * std.sin(uv.x * 20), 0, 0, 1);
  }),
  targets: { format: 'rgba16float' },
});

const display = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
    'use gpu';
    const value = std.textureSampleLevel(fieldView.$, sampler.$, uv, 0).x;
    return d.vec4f(value, value, value, 1);
  }),
  targets: { format: presentationFormat },
});

const encoder = root.createCommandEncoder();
const bakePass = encoder.beginRenderPass({ colorAttachments: { view: field } });
bake.with(bakePass).draw(3);
bakePass.end();
const displayPass = encoder.beginRenderPass({ colorAttachments: { view: context } });
display.with(displayPass).draw(3);
displayPass.end();
encoder.submit();
```

- The producer pass must end before the consumer starts, and keep the default `storeOp: 'store'`. Sampling a texture subresource while it's a render attachment is invalid.
- For a field that doesn't change every frame, record the bake only when its inputs change and record just the display pass on other frames. Values only the display reads (gain, tint) belong in a uniform, so changing them doesn't need a rebake.
- Create the texture, views and sampler once, not per frame.

### Mapping a domain to texel centers

Ordinary UVs put the domain endpoints on texture edges, so filtering at `0` and `1` blends with the clamp border. When a lookup table's endpoints must land exactly on the first and last texels, map through texel centers in both the writer and the reader:

```ts
const toTexelCenter = (u: number, count: number) => {
  'use gpu';
  return (u * (count - 1) + 0.5) / count;
};
```

### Explicit LOD or gradients from one helper

A parameter typed `d.v2f | d.v4f` resolves into one overload per call-site type, and `.kind` is known at resolution time, so the branch is pruned rather than tested at runtime:

```ts
const sampleField = (uv: d.v2f, footprint: d.v2f | d.v4f) => {
  'use gpu';
  if (footprint.kind === 'vec2f') {
    return std.textureSampleLevel(fieldView.$, sampler.$, uv, footprint.x);
  }
  return std.textureSampleGrad(fieldView.$, sampler.$, uv, footprint.xy, footprint.zw);
};
```

Compute gradients in uniform fragment control flow before calling it; compute and vertex stages use explicit LOD.
