# TypeGPU `std` Library Reference

`std` wraps WGSL built-in functions ([WGSL spec section 16](https://www.w3.org/TR/WGSL/#builtin-functions)) plus some TypeGPU additions. The WGSL documentation applies.

```ts
import { std } from 'typegpu';
```

The listing covers every export of `typegpu/std`.

**Math**
```ts
std.abs   std.sign   std.floor   std.ceil   std.round   std.fract   std.trunc
std.sqrt  std.inverseSqrt   std.saturate   // saturate: clamp to [0, 1]
std.exp   std.exp2   std.log   std.log2
std.pow(x, y)                 // WGSL pow, undefined for x < 0; `x ** n` handles negative bases (references/shaders.md)
std.min(a, b, ...)  std.max(a, b, ...)   // variadic: std.max(dx, dy, dz)
std.clamp(x, lo, hi)
std.intdiv(a, b)              // integer division; `/` always divides as f32
std.mix(a, b, t)              // linear interpolation
std.smoothstep(edge0, edge1, x)
std.step(edge, x)
std.select(falseVal, trueVal, cond)
std.isCloseTo(a, b, precision?) // |a - b| <= precision (0.01 default), scalar or vector
std.fma(a, b, c)  std.modf(x)  std.frexp(x)  std.ldexp(x, e)  std.quantizeToF16(x)
std.copy(x)                   // schema-agnostic deep copy (works when exact schema is generic)
std.bitcast(d.u32, d.f32)(x)  // reinterpret bits; any scalar/vector pair of equal size
```

The older `std.bitcastU32toF32`, `bitcastU32toI32` and `bitcastF32toU32` are deprecated; use `std.bitcast`.

**Bits** (integer scalars and vectors)
```ts
std.countOneBits  std.countLeadingZeros  std.countTrailingZeros  std.reverseBits
std.firstLeadingBit  std.firstTrailingBit
std.extractBits(e, offset, count)  std.insertBits(e, newbits, offset, count)
```

**Operator functions** — `std.add`, `std.sub`, `std.mul`, `std.div`, `std.mod`, `std.neg`, `std.bitShiftLeft`, `std.bitShiftRight` are function forms of `+ - * / % -x << >>`, for code that can't use `tsover` (see `references/setup.md`). Inside `'use gpu'` write the operators.

**Comparison / boolean** — componentwise on vectors, returning bool vectors (`d.vec2b`/`d.vec3b`/`d.vec4b`); combine with `std.select` for vectorized branching
```ts
std.eq  std.ne  std.lt  std.le  std.gt  std.ge   // componentwise -> vecNb
std.all(bv)  std.any(bv)  std.allEq(a, b)        // allEq = all(eq(a, b))
std.and(bv, bv)  std.or(bv, bv)  std.not(bv)
```

**Trig**
```ts
std.sin  std.cos  std.tan  std.asin  std.acos  std.atan  std.atan2
std.sinh std.cosh std.tanh  std.asinh  std.acosh  std.atanh
std.degrees  std.radians
```

**Vector / matrix** — matrix × vector and matrix × matrix are the `*` operator
```ts
std.dot(a, b)         std.cross(a, b)      std.length(v)
std.normalize(v)      std.distance(a, b)
std.reflect(i, n)     std.refract(i, n, eta)
std.faceForward(n, i, nRef)
std.transpose(m)      std.determinant(m)
std.identity2/3/4()   std.translation4(v)  std.scaling4(v)   // build matrices in-shader
std.rotationX4(rad)   std.rotationY4(rad)  std.rotationZ4(rad)
std.translate4(m, v)  std.scale4(m, v)     std.rotateX4(m, rad)  // + Y4/Z4; e.g. rotateX4(m, a) = rotationX4(a) * m
```

**Arrays and loops**
```ts
std.arrayLength(arr)  // runtime-sized storage array -> WGSL arrayLength;
                      // fixed-size array -> folds to the constant
std.range(end)  std.range(start, end)  std.range(start, end, step)
                      // compile-time integer range for for...of (references/shaders.md)
```

**Texture** — stage/uniformity rules and the sampling reference table live in `references/textures.md`. Short version: `textureSample` is fragment-only and must be in uniform control flow; `textureSampleLevel` works in any stage; `textureSampleGrad` gives auto-LOD in compute/non-uniform branches.
```ts
std.textureSample(view.$, sampler.$, uv)
std.textureSampleLevel(view.$, sampler.$, uv, mipLevel)
std.textureSampleGrad(view.$, sampler.$, uv, ddx, ddy)
std.textureSampleBias(view.$, sampler.$, uv, bias)
std.textureSampleBaseClampToEdge(view.$, sampler.$, uv)
std.textureSampleCompare(depthView.$, comparisonSampler.$, uv, ref)
std.textureSampleCompareLevel(depthView.$, comparisonSampler.$, uv, ref)
std.textureGather(component, view.$, sampler.$, uv)
std.textureGatherCompare(depthView.$, comparisonSampler.$, uv, ref)
std.textureLoad(view.$, coords, mipLevel)
std.textureStore(storageView.$, coords, value)
std.textureDimensions(view.$)
std.textureNumLevels(view.$)  std.textureNumLayers(view.$)  std.textureNumSamples(view.$)
```

**Fragment control**
```ts
std.discard()   // fragment-only; discards the fragment (WGSL `discard`)
```

**Derivatives** (fragment only)
```ts
std.dpdx(v)  std.dpdy(v)  std.fwidth(v)   // + Coarse/Fine variants of each
```

**Synchronization** (compute only)
```ts
std.workgroupBarrier()   std.storageBarrier()   std.textureBarrier()
std.workgroupUniformLoad(wgVar.$)   // barrier + load, result is uniform across the workgroup
```

**Atomic**
```ts
std.atomicLoad(ptr)         std.atomicStore(ptr, val)
std.atomicAdd(ptr, val)     std.atomicSub(ptr, val)
std.atomicMin(ptr, val)     std.atomicMax(ptr, val)
std.atomicAnd(ptr, val)     std.atomicOr(ptr, val)     std.atomicXor(ptr, val)
std.atomicExchange(ptr, val)
std.atomicCompareExchangeWeak(ptr, cmp, val)  // -> { old_value, exchanged }; may fail spuriously, retry in a loop
```

**Packing** — the full WGSL set: `pack`/`unpack` × `4x8unorm`, `4x8snorm`, `2x16unorm`, `2x16snorm`, `2x16float`, `4xI8`, `4xU8`, plus `pack4xI8Clamp`/`pack4xU8Clamp` and `dot4I8Packed`/`dot4U8Packed`
```ts
std.pack4x8unorm(v)   std.unpack4x8unorm(x)   // vec4f in [0, 1] <-> u32
```

**Subgroups** (require the `subgroups` device feature — see `references/setup.md`)
```ts
std.subgroupAdd / Mul / Min / Max / And / Or / Xor (value)
std.subgroupExclusiveAdd / ExclusiveMul / InclusiveAdd / InclusiveMul (value)
std.subgroupAll / Any (bool)    std.subgroupBallot(bool)   std.subgroupElect()
std.subgroupBroadcast(value, lane)   std.subgroupBroadcastFirst(value)
std.subgroupShuffle / ShuffleUp / ShuffleDown / ShuffleXor (value, x)
std.quadBroadcast(value, lane)   std.quadSwapX / quadSwapY / quadSwapDiagonal (value)
// builtins: d.builtin.subgroupId, subgroupSize, subgroupInvocationId, numSubgroups
```

**Environment and compile-time probes** — evaluated during shader generation, so branches on them are pruned
```ts
std.isBeingTranspiled()        // true while a 'use gpu' function is generated, false in plain JS
std.getTargetShaderLanguage()  // 'wgsl' ('glsl' with @typegpu/gl) during generation, undefined otherwise
std.getShaderStage()           // 'vertex' | 'fragment' | 'compute' | undefined
std.extensionEnabled('f16')    // WGSL extension enabled for this shader: 'f16', 'subgroups',
                               // 'clip_distances', 'dual_source_blending', 'primitive_index'
std.isKnownAtComptime(value)   // value fixed during generation (captured JS value, slot, fixed array length)
std.typeOf(value)              // schema of value in the generated shader; GPU-only, compare it immediately
```

`std.extensionEnabled` throws when called from plain JS. Typical use: one function with a subgroup path and a fallback, `if (std.extensionEnabled('subgroups')) { ... } else { ... }`. Usage of `std.isKnownAtComptime` and `std.typeOf`: `references/shaders.md`.
