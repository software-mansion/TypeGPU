import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { f32 } from '../data/numeric.ts';
import { vec2f, vec3f, vec4f } from '../data/vector.ts';
import type { AnyFloat32VecInstance } from '../data/wgslTypes.ts';
import { unifyRestrictedSignature } from './numeric.ts';

type DerivativeSignature = ((value: number) => number) &
  (<T extends AnyFloat32VecInstance>(value: T) => T);

const derivativeNormalError = 'Derivative builtins are not allowed on the CPU';
// WGSL derivative builtins only accept f32 and vecN<f32>
const derivativeSignature = unifyRestrictedSignature([f32, vec2f, vec3f, vec4f]);

export const dpdx = dualImpl<DerivativeSignature>({
  name: 'dpdx',
  normalImpl: derivativeNormalError,
  signature: derivativeSignature,
  codegenImpl: (ctx, [value]) => ctx.gen.emitCall('dpdx', [], [value]),
  sideEffects: false,
});

export const dpdxCoarse = dualImpl<DerivativeSignature>({
  name: 'dpdxCoarse',
  normalImpl: derivativeNormalError,
  signature: derivativeSignature,
  codegenImpl: (_ctx, [value]) => stitch`dpdxCoarse(${value})`,
  sideEffects: false,
});

export const dpdxFine = dualImpl<DerivativeSignature>({
  name: 'dpdxFine',
  normalImpl: derivativeNormalError,
  signature: derivativeSignature,
  codegenImpl: (_ctx, [value]) => stitch`dpdxFine(${value})`,
  sideEffects: false,
});

export const dpdy = dualImpl<DerivativeSignature>({
  name: 'dpdy',
  normalImpl: derivativeNormalError,
  signature: derivativeSignature,
  codegenImpl: (ctx, [value]) => ctx.gen.emitCall('dpdy', [], [value]),
  sideEffects: false,
});

export const dpdyCoarse = dualImpl<DerivativeSignature>({
  name: 'dpdyCoarse',
  normalImpl: derivativeNormalError,
  signature: derivativeSignature,
  codegenImpl: (_ctx, [value]) => stitch`dpdyCoarse(${value})`,
  sideEffects: false,
});

export const dpdyFine = dualImpl<DerivativeSignature>({
  name: 'dpdyFine',
  normalImpl: derivativeNormalError,
  signature: derivativeSignature,
  codegenImpl: (_ctx, [value]) => stitch`dpdyFine(${value})`,
  sideEffects: false,
});

export const fwidth = dualImpl<DerivativeSignature>({
  name: 'fwidth',
  normalImpl: derivativeNormalError,
  signature: derivativeSignature,
  codegenImpl: (ctx, [value]) => ctx.gen.emitCall('fwidth', [], [value]),
  sideEffects: false,
});

export const fwidthCoarse = dualImpl<DerivativeSignature>({
  name: 'fwidthCoarse',
  normalImpl: derivativeNormalError,
  signature: derivativeSignature,
  codegenImpl: (_ctx, [value]) => stitch`fwidthCoarse(${value})`,
  sideEffects: false,
});

export const fwidthFine = dualImpl<DerivativeSignature>({
  name: 'fwidthFine',
  normalImpl: derivativeNormalError,
  signature: derivativeSignature,
  codegenImpl: (_ctx, [value]) => stitch`fwidthFine(${value})`,
  sideEffects: false,
});
