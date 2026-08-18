import { d, tgpu } from 'typegpu';

export const ElementwiseUniforms = d.struct({
  rhsBase: d.u32,
});

export const ChannelAffineUniforms = d.struct({
  elementCount: d.u32,
  logicalChannels: d.u32,
  channelBlocks: d.u32,
  scaleBase: d.u32,
  biasBase: d.u32,
});

export const PoolUniforms = d.struct({
  inputWidth: d.u32,
  inputHeight: d.u32,
  outputWidth: d.u32,
  outputHeight: d.u32,
  channelBlocks: d.u32,
  logicalChannels: d.u32,
  windowWidth: d.u32,
  windowHeight: d.u32,
  strideX: d.u32,
  strideY: d.u32,
  elementCount: d.u32,
});

export const ResizeUniforms = d.struct({
  inputWidth: d.u32,
  inputHeight: d.u32,
  outputWidth: d.u32,
  outputHeight: d.u32,
  channelBlocks: d.u32,
  logicalChannels: d.u32,
  elementCount: d.u32,
});

export const LayerNormUniforms = d.struct({
  pixelCount: d.u32,
  logicalChannels: d.u32,
  channelBlocks: d.u32,
  epsilon: d.f32,
  gammaBase: d.u32,
  betaBase: d.u32,
});

export const CrossScanUniforms = d.struct({
  width: d.u32,
  height: d.u32,
  logicalChannels: d.u32,
  channelBlocks: d.u32,
  positionCount: d.u32,
  elementCount: d.u32,
});

export const SelectiveScanUniforms = d.struct({
  width: d.u32,
  height: d.u32,
  logicalChannels: d.u32,
  channelBlocks: d.u32,
  positionCount: d.u32,
  sequenceCount: d.u32,
  aBase: d.u32,
  dBase: d.u32,
  deltaBiasBase: d.u32,
});

export const ScanProjectUniforms = d.struct({
  width: d.u32,
  height: d.u32,
  logicalChannels: d.u32,
  channelBlocks: d.u32,
  rank: d.u32,
  positionCount: d.u32,
  directionPositionCount: d.u32,
  xProjectionWeightBase: d.u32,
  dtProjectionWeightBase: d.u32,
});

export const Conv2dUniforms = d.struct({
  inputWidth: d.u32,
  inputHeight: d.u32,
  outputWidth: d.u32,
  outputHeight: d.u32,
  inputChannelBlocks: d.u32,
  outputChannelBlocks: d.u32,
  logicalOutputChannels: d.u32,
  strideX: d.u32,
  strideY: d.u32,
  padX: d.u32,
  padY: d.u32,
  elementCount: d.u32,
  weightBase: d.u32,
  biasBase: d.u32,
});

/** Runtime-only F(2x2,3x3) metadata; transformed weights use coefficient-major O4/I4. */
export const WinogradF2Uniforms = d.struct({
  width: d.u32,
  height: d.u32,
  inputChannelBlocks: d.u32,
  outputChannelBlocks: d.u32,
  logicalOutputChannels: d.u32,
  tilesX: d.u32,
  tilesY: d.u32,
  tileCount: d.u32,
  weightBasePairs: d.u32,
  biasBase: d.u32,
});

export const DepthwiseConvUniforms = d.struct({
  inputWidth: d.u32,
  inputHeight: d.u32,
  outputWidth: d.u32,
  outputHeight: d.u32,
  channelBlocks: d.u32,
  logicalChannels: d.u32,
  strideX: d.u32,
  strideY: d.u32,
  padX: d.u32,
  padY: d.u32,
  kernelLength: d.u32,
  elementCount: d.u32,
  weightBase: d.u32,
  biasBase: d.u32,
});

/** Channel counts are stored as vec4 block counts because split boundaries are block aligned. */
export const ChannelViewUniforms = d.struct({
  lowChannelBlocks: d.u32,
  highChannelBlocks: d.u32,
  totalChannelBlocks: d.u32,
  elementCount: d.u32,
});

export const unaryLayout = tgpu.bindGroupLayout({
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const binaryLayout = tgpu.bindGroupLayout({
  params: { uniform: ElementwiseUniforms },
  lhs: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  rhs: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const channelAffineLayout = tgpu.bindGroupLayout({
  params: { uniform: ChannelAffineUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  scale: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  bias: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const poolLayout = tgpu.bindGroupLayout({
  params: { uniform: PoolUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const resizeLayout = tgpu.bindGroupLayout({
  params: { uniform: ResizeUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const layerNormLayout = tgpu.bindGroupLayout({
  params: { uniform: LayerNormUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  gamma: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  beta: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const crossMergeLayout = tgpu.bindGroupLayout({
  params: { uniform: CrossScanUniforms },
  directionalSrc: { storage: d.arrayOf(d.f32), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

/**
 * Scalar scan tensors use these layouts:
 *
 * - `delta`, `directionalDst`: `[direction][channel][position]`
 * - `b`, `c`: `[direction][state][position]`
 * - `a`: `[direction][channel][state]`, after scalar `aBase`
 * - `d`, `deltaBias`: `[direction][channel]`, after their scalar bases
 */
export const selectiveScanLayout = tgpu.bindGroupLayout({
  params: { uniform: SelectiveScanUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  delta: { storage: d.arrayOf(d.f32), access: 'readonly' },
  b: { storage: d.arrayOf(d.f32), access: 'readonly' },
  c: { storage: d.arrayOf(d.f32), access: 'readonly' },
  a: { storage: d.arrayOf(d.f32), access: 'readonly' },
  d: { storage: d.arrayOf(d.f32), access: 'readonly' },
  deltaBias: { storage: d.arrayOf(d.f32), access: 'readonly' },
  directionalDst: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

/**
 * `xProjectionWeightBase` and `dtProjectionWeightBase` are vec4 offsets into the
 * shared FP32 weight arena. Both matrices use direction-major O4/I4 tiles.
 */
export const scanProjectLayout = tgpu.bindGroupLayout({
  params: { uniform: ScanProjectUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  weights: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  delta: { storage: d.arrayOf(d.f32), access: 'mutable' },
  b: { storage: d.arrayOf(d.f32), access: 'mutable' },
  c: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

/**
 * Regular-convolution weights are FP32 O4/I4 tiles. Each tile contains four
 * consecutive vec4 rows, one row per output lane. Bias is one vec4 per O4 block.
 */
export const conv2dLayout = tgpu.bindGroupLayout({
  params: { uniform: Conv2dUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  weights: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  bias: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

/**
 * Native-FP16 convolution storage. Activations are addressed in 64-bit pairs so
 * one shader can still specialize to FP16 or FP32 HWC4 at compile time, while an
 * FP16 vec4 costs one load instead of two and an FP32 vec4 two instead of four.
 * Weights are always FP16 here, so they are typed directly; bias and
 * accumulation remain FP32.
 */
export const nativeF16Conv2dLayout = tgpu.bindGroupLayout({
  params: { uniform: Conv2dUniforms },
  src: { storage: d.arrayOf(d.vec2u), access: 'readonly' },
  weights: { storage: d.arrayOf(d.vec4h), access: 'readonly' },
  bias: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec2u), access: 'mutable' },
});

/** Byte-addressed source/destination supports both FP32 and native-FP16 HWC4. */
export const winogradF2InputLayout = tgpu.bindGroupLayout({
  params: { uniform: WinogradF2Uniforms },
  src: { storage: d.arrayOf(d.u32), access: 'readonly' },
  dst: { storage: d.arrayOf(d.u32), access: 'mutable' },
});

/**
 * Transformed input and weights are addressed in 64-bit pairs, so an FP16 vec4
 * costs one load and an FP32 vec4 two rather than two and four. Transformed
 * output always accumulates in FP32. `weightBasePairs` counts those pairs, and
 * transformed weights get their own buffer, so it is always zero.
 */
export const winogradF2GemmLayout = tgpu.bindGroupLayout({
  params: { uniform: WinogradF2Uniforms },
  src: { storage: d.arrayOf(d.vec2u), access: 'readonly' },
  weights: { storage: d.arrayOf(d.vec2u), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

/** Inverse transform is FP32 and converts only at the final HWC4 store boundary. */
export const winogradF2OutputLayout = tgpu.bindGroupLayout({
  params: { uniform: WinogradF2Uniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  bias: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.u32), access: 'mutable' },
});

/** Depthwise weights are one vec4 per channel block and spatial/axis tap. */
export const depthwiseConvLayout = tgpu.bindGroupLayout({
  params: { uniform: DepthwiseConvUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  weights: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  bias: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

/** Packed-FP16 depthwise weights, decoded to FP32 before multiplication. */
export const packedF16DepthwiseConvLayout = tgpu.bindGroupLayout({
  params: { uniform: DepthwiseConvUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  weights: { storage: d.arrayOf(d.u32), access: 'readonly' },
  bias: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

/** Native-FP16 depthwise storage with compile-time FP16/FP32 activation IO. */
export const nativeF16DepthwiseConvLayout = tgpu.bindGroupLayout({
  params: { uniform: DepthwiseConvUniforms },
  src: { storage: d.arrayOf(d.u32), access: 'readonly' },
  weights: { storage: d.arrayOf(d.u32), access: 'readonly' },
  bias: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.u32), access: 'mutable' },
});

export const channelSplitLayout = tgpu.bindGroupLayout({
  params: { uniform: ChannelViewUniforms },
  src: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  lowDst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
  highDst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

export const channelConcatLayout = tgpu.bindGroupLayout({
  params: { uniform: ChannelViewUniforms },
  lowSrc: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  highSrc: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  dst: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});
