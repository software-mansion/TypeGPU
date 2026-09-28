import type { TgpuPrimitiveState } from 'typegpu';
import { WebGLFallbackUnsupportedError } from './errors.ts';

/** Mirrors `TgpuColorTargetState` from 'typegpu', which isn't exported */
export type ColorTargetState =
  | (Omit<GPUColorTargetState, 'format'> & { format?: GPUTextureFormat | undefined })
  | undefined;

// GPUColorWrite flags. Spelled out, since WebGPU globals don't exist in browsers without WebGPU.
const COLOR_WRITE_RED = 0x1;
const COLOR_WRITE_GREEN = 0x2;
const COLOR_WRITE_BLUE = 0x4;
const COLOR_WRITE_ALPHA = 0x8;
const COLOR_WRITE_ALL = 0xf;

export function glTopology(
  gl: WebGL2RenderingContext,
  topology: GPUPrimitiveTopology | undefined,
): number {
  // `stripIndexFormat` needs no mapping: WebGL 2 always has primitive restart enabled
  // (PRIMITIVE_RESTART_FIXED_INDEX), with the maximum value of the index type as the
  // restart index, which is exactly what WebGPU does for strip topologies.
  switch (topology ?? 'triangle-list') {
    case 'point-list':
      return gl.POINTS;
    case 'line-list':
      return gl.LINES;
    case 'line-strip':
      return gl.LINE_STRIP;
    case 'triangle-list':
      return gl.TRIANGLES;
    case 'triangle-strip':
      return gl.TRIANGLE_STRIP;
    default:
      throw new WebGLFallbackUnsupportedError(`primitive topology '${topology}'`);
  }
}

function glBlendFactor(gl: WebGL2RenderingContext, factor: GPUBlendFactor | undefined): number {
  switch (factor) {
    case 'zero':
      return gl.ZERO;
    case 'one':
      return gl.ONE;
    case 'src':
      return gl.SRC_COLOR;
    case 'one-minus-src':
      return gl.ONE_MINUS_SRC_COLOR;
    case 'src-alpha':
      return gl.SRC_ALPHA;
    case 'one-minus-src-alpha':
      return gl.ONE_MINUS_SRC_ALPHA;
    case 'dst':
      return gl.DST_COLOR;
    case 'one-minus-dst':
      return gl.ONE_MINUS_DST_COLOR;
    case 'dst-alpha':
      return gl.DST_ALPHA;
    case 'one-minus-dst-alpha':
      return gl.ONE_MINUS_DST_ALPHA;
    case 'src-alpha-saturated':
      return gl.SRC_ALPHA_SATURATE;
    case 'constant':
      return gl.CONSTANT_COLOR;
    case 'one-minus-constant':
      return gl.ONE_MINUS_CONSTANT_COLOR;
    default:
      throw new WebGLFallbackUnsupportedError(
        `blend factor '${factor}'`,
        'dual-source blending is not part of WebGL 2',
      );
  }
}

function glBlendOp(gl: WebGL2RenderingContext, operation: GPUBlendOperation | undefined): number {
  switch (operation ?? 'add') {
    case 'add':
      return gl.FUNC_ADD;
    case 'subtract':
      return gl.FUNC_SUBTRACT;
    case 'reverse-subtract':
      return gl.FUNC_REVERSE_SUBTRACT;
    case 'min':
      return gl.MIN;
    case 'max':
      return gl.MAX;
    default:
      throw new WebGLFallbackUnsupportedError(`blend operation '${operation}'`);
  }
}

export interface GLBlendState {
  readonly colorOp: number;
  readonly alphaOp: number;
  readonly colorSrc: number;
  readonly colorDst: number;
  readonly alphaSrc: number;
  readonly alphaDst: number;
}

export interface GLColorTargetState {
  readonly blend: GLBlendState | undefined;
  readonly colorMask: readonly [boolean, boolean, boolean, boolean];
}

export function glColorTargetState(
  gl: WebGL2RenderingContext,
  target: ColorTargetState,
): GLColorTargetState {
  const blend = target?.blend;
  const writeMask = target?.writeMask ?? COLOR_WRITE_ALL;
  return {
    blend: blend && {
      colorOp: glBlendOp(gl, blend.color.operation),
      alphaOp: glBlendOp(gl, blend.alpha.operation),
      colorSrc: glBlendFactor(gl, blend.color.srcFactor ?? 'one'),
      colorDst: glBlendFactor(gl, blend.color.dstFactor ?? 'zero'),
      alphaSrc: glBlendFactor(gl, blend.alpha.srcFactor ?? 'one'),
      alphaDst: glBlendFactor(gl, blend.alpha.dstFactor ?? 'zero'),
    },
    colorMask: [
      (writeMask & COLOR_WRITE_RED) !== 0,
      (writeMask & COLOR_WRITE_GREEN) !== 0,
      (writeMask & COLOR_WRITE_BLUE) !== 0,
      (writeMask & COLOR_WRITE_ALPHA) !== 0,
    ],
  };
}

export interface GLPrimitiveState {
  readonly mode: number;
  /** `undefined` when culling is disabled */
  readonly cullFace: number | undefined;
  readonly frontFace: number;
}

export function glPrimitiveState(
  gl: WebGL2RenderingContext,
  primitive: TgpuPrimitiveState,
): GLPrimitiveState {
  if (primitive?.unclippedDepth) {
    throw new WebGLFallbackUnsupportedError('unclippedDepth');
  }

  const cullMode = primitive?.cullMode ?? 'none';
  return {
    mode: glTopology(gl, primitive?.topology),
    cullFace: cullMode === 'none' ? undefined : cullMode === 'front' ? gl.FRONT : gl.BACK,
    frontFace: primitive?.frontFace === 'cw' ? gl.CW : gl.CCW,
  };
}

/**
 * Pipelines share one GL context, so every piece of state that a pipeline could have
 * changed is set on every draw, whether this pipeline uses it or not.
 */
export function applyPrimitiveAndTargetState(
  gl: WebGL2RenderingContext,
  primitive: GLPrimitiveState,
  target: GLColorTargetState,
): void {
  if (primitive.cullFace === undefined) {
    gl.disable(gl.CULL_FACE);
  } else {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(primitive.cullFace);
  }
  gl.frontFace(primitive.frontFace);

  // Never enabled by the fallback itself, but a user-provided context might have it on
  gl.disable(gl.SCISSOR_TEST);

  const blend = target.blend;
  if (blend) {
    gl.enable(gl.BLEND);
    gl.blendEquationSeparate(blend.colorOp, blend.alphaOp);
    gl.blendFuncSeparate(blend.colorSrc, blend.colorDst, blend.alphaSrc, blend.alphaDst);
    // The blend constant can only be set on a render pass in WebGPU, which the fallback
    // doesn't have, so it stays at its default value.
    gl.blendColor(0, 0, 0, 0);
  } else {
    gl.disable(gl.BLEND);
  }
  gl.colorMask(...target.colorMask);
}

function glCompareFunc(
  gl: WebGL2RenderingContext,
  compare: GPUCompareFunction | undefined,
): number {
  switch (compare ?? 'always') {
    case 'never':
      return gl.NEVER;
    case 'less':
      return gl.LESS;
    case 'equal':
      return gl.EQUAL;
    case 'less-equal':
      return gl.LEQUAL;
    case 'greater':
      return gl.GREATER;
    case 'not-equal':
      return gl.NOTEQUAL;
    case 'greater-equal':
      return gl.GEQUAL;
    case 'always':
      return gl.ALWAYS;
    default:
      throw new WebGLFallbackUnsupportedError(`compare function '${compare}'`);
  }
}

function glStencilOp(
  gl: WebGL2RenderingContext,
  operation: GPUStencilOperation | undefined,
): number {
  switch (operation ?? 'keep') {
    case 'keep':
      return gl.KEEP;
    case 'zero':
      return gl.ZERO;
    case 'replace':
      return gl.REPLACE;
    case 'invert':
      return gl.INVERT;
    case 'increment-clamp':
      return gl.INCR;
    case 'decrement-clamp':
      return gl.DECR;
    case 'increment-wrap':
      return gl.INCR_WRAP;
    case 'decrement-wrap':
      return gl.DECR_WRAP;
    default:
      throw new WebGLFallbackUnsupportedError(`stencil operation '${operation}'`);
  }
}

export interface GLStencilFaceState {
  readonly compare: number;
  readonly fail: number;
  readonly depthFail: number;
  readonly pass: number;
}

export interface GLDepthStencilState {
  readonly depthCompare: number;
  readonly depthWrite: boolean;
  /** `undefined` when there's no depth bias */
  readonly polygonOffset: { readonly factor: number; readonly units: number } | undefined;
  /** `undefined` when the stencil state has no effect (the default one) */
  readonly stencil:
    | {
        readonly front: GLStencilFaceState;
        readonly back: GLStencilFaceState;
        readonly readMask: number;
        readonly writeMask: number;
      }
    | undefined;
}

function glStencilFaceState(
  gl: WebGL2RenderingContext,
  face: GPUStencilFaceState | undefined,
): GLStencilFaceState {
  return {
    compare: glCompareFunc(gl, face?.compare),
    fail: glStencilOp(gl, face?.failOp),
    depthFail: glStencilOp(gl, face?.depthFailOp),
    pass: glStencilOp(gl, face?.passOp),
  };
}

function isDefaultStencilFace(face: GPUStencilFaceState | undefined): boolean {
  return (
    (face?.compare ?? 'always') === 'always' &&
    (face?.failOp ?? 'keep') === 'keep' &&
    (face?.depthFailOp ?? 'keep') === 'keep' &&
    (face?.passOp ?? 'keep') === 'keep'
  );
}

export function glDepthStencilState(
  gl: WebGL2RenderingContext,
  depthStencil: GPUDepthStencilState,
): GLDepthStencilState {
  if (depthStencil.depthBiasClamp) {
    throw new WebGLFallbackUnsupportedError('depthBiasClamp');
  }

  const depthBias = depthStencil.depthBias ?? 0;
  const slopeScale = depthStencil.depthBiasSlopeScale ?? 0;
  const usesStencil =
    !isDefaultStencilFace(depthStencil.stencilFront) ||
    !isDefaultStencilFace(depthStencil.stencilBack);

  return {
    depthCompare: glCompareFunc(gl, depthStencil.depthCompare),
    depthWrite: depthStencil.depthWriteEnabled ?? false,
    polygonOffset:
      depthBias !== 0 || slopeScale !== 0 ? { factor: slopeScale, units: depthBias } : undefined,
    stencil: usesStencil
      ? {
          front: glStencilFaceState(gl, depthStencil.stencilFront),
          back: glStencilFaceState(gl, depthStencil.stencilBack),
          readMask: depthStencil.stencilReadMask ?? 0xffffffff,
          writeMask: depthStencil.stencilWriteMask ?? 0xffffffff,
        }
      : undefined,
  };
}

export interface DepthStencilDrawOptions {
  readonly depthReadOnly: boolean;
  readonly stencilReadOnly: boolean;
  readonly stencilReference: number;
}

/**
 * Like {@link applyPrimitiveAndTargetState}, sets all of the depth and stencil state on
 * every draw. `state` is undefined when the draw has no depth testing.
 */
export function applyDepthStencilState(
  gl: WebGL2RenderingContext,
  state: GLDepthStencilState | undefined,
  options: DepthStencilDrawOptions,
): void {
  if (!state) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    return;
  }

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(state.depthCompare);
  gl.depthMask(state.depthWrite && !options.depthReadOnly);

  if (state.polygonOffset) {
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(state.polygonOffset.factor, state.polygonOffset.units);
  } else {
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  const stencil = state.stencil;
  if (!stencil) {
    gl.disable(gl.STENCIL_TEST);
    return;
  }
  gl.enable(gl.STENCIL_TEST);
  const writeMask = options.stencilReadOnly ? 0 : stencil.writeMask;
  for (const [face, faceState] of [
    [gl.FRONT, stencil.front],
    [gl.BACK, stencil.back],
  ] as const) {
    gl.stencilFuncSeparate(face, faceState.compare, options.stencilReference, stencil.readMask);
    gl.stencilOpSeparate(face, faceState.fail, faceState.depthFail, faceState.pass);
    gl.stencilMaskSeparate(face, writeMask);
  }
}
