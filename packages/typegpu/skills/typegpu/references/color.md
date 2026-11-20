# `@typegpu/color` - Colour Spaces and Tonemapping

Colour-space conversions and HDR tonemapping curves as typed `tgpu.fn`s, callable from `'use gpu'` code. Docs: <https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-color.md>.

```ts
import { aces, hexToRgb, linearToSrgb, oklabToRgb, rgbToOklab, srgbToLinear } from '@typegpu/color';
```

Naming: `rgb` means sRGB-encoded (gamma) values in `[0, 1]`; `linear`/`linearRgb` means linear light. Light, blending and tonemapping work in linear space.

## Conversions

All take and return `vec3f`.

| Function | From → to |
|---|---|
| `srgbToLinear(rgb)` | sRGB-encoded → linear |
| `linearToSrgb(linear)` | linear → sRGB-encoded |
| `rgbToHsv(rgb)` / `hsvToRgb(hsv)` | RGB ↔ HSV, all components in `[0, 1]` (hue `1` = 360°) |
| `rgbToOklab(rgb)` | sRGB-encoded → Oklab `(L, a, b)` |
| `oklabToRgb(lab)` | Oklab → sRGB-encoded, gamut-clipped through `oklabGamutClipSlot` |
| `linearRgbToOklab(linear)` / `oklabToLinearRgb(lab)` | linear ↔ Oklab, no clipping |
| `rgbToYcbcr(rgb)` | RGB → YCbCr (BT.601 full range, Cb/Cr centred on 0); `rgbToYcbcrMatrix` is the `tgpu.const` `mat3x3f` behind it |

Interpolate in Oklab for perceptually even gradients: `oklabToRgb(std.mix(rgbToOklab(a), rgbToOklab(b), t))`.

### Oklab gamut clipping

`oklabToRgb` maps out-of-gamut colours back into sRGB with the function in `oklabGamutClipSlot` (default `oklabGamutClip.adaptiveL05`). Alternatives: `oklabGamutClip.preserveChroma`, `oklabGamutClip.adaptiveL0Cusp`. The adaptive modes read their strength from `oklabGamutClipAlphaAccess` (default `0.2`).

```ts
const pipeline = root
  .with(oklabGamutClipSlot, oklabGamutClip.preserveChroma)
  .with(oklabGamutClipAlphaAccess, () => params.$.alpha)
  .createRenderPipeline({ vertex, fragment });
```

## Hex literals

`hexToRgb(hex)`, `hexToRgba(hex)` and `hexToOklab(hex)` are `tgpu.comptime` functions: call them on the CPU or inside shaders with a constant argument, and the result is inlined. Accept `'#RRGGBB'`, `'#RRGGBBAA'` (hex strings, `#` optional) or a number (`0xRRGGBB`; `0xRRGGBBAA` for `hexToRgba`). Results are sRGB-encoded; wrap with `srgbToLinear` before lighting.

```ts
const background = hexToRgb('#E0E7FF'); // d.v3f, usable as a captured constant
```

## Tonemapping

`aces`, `hable`, `reinhard`, `neutral`: `(linear HDR vec3f) => vec3f` in `[0, 1]`, still linear.

| Function | Curve |
|---|---|
| `aces` | ACES filmic fit (Narkowicz) |
| `hable` | Uncharted 2 filmic, white point 11.2 |
| `reinhard` | `x / (1 + x)` per channel |
| `neutral` | Khronos PBR Neutral; keeps hues and low-range values |

Apply exposure by multiplying before the curve; the functions take no exposure parameter. Encode for display afterwards: write to an `-srgb` view (`bgra8unorm-srgb` via the context's `viewFormats`) or call `linearToSrgb`.

```ts
const fragment = ({ uv }: { uv: d.v2f }) => {
  'use gpu';
  const hdr = std.textureSampleLevel(hdrView.$, sampler.$, uv, 0).rgb;
  return d.vec4f(linearToSrgb(aces(hdr * exposure.$)), 1);
};
```
