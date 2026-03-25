import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import type { AnyFloat32VecInstance } from '../data/wgslTypes.ts';

type DerivativeSignature = ((value: number) => number) &
  (<T extends AnyFloat32VecInstance>(value: T) => T);

const derivativeNormalError = 'Derivative builtins are not allowed on the CPU';

export const dpdx = dualImpl<DerivativeSignature>({
  name: 'dpdx',
  normalImpl: derivativeNormalError,
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (_ctx, [value]) => stitch`dpdx(${value})`,
});

export const dpdxCoarse = dualImpl<DerivativeSignature>({
  name: 'dpdxCoarse',
  normalImpl: derivativeNormalError,
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (_ctx, [value]) => stitch`dpdxCoarse(${value})`,
});

export const dpdxFine = dualImpl<DerivativeSignature>({
  name: 'dpdxFine',
  normalImpl: derivativeNormalError,
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (_ctx, [value]) => stitch`dpdxFine(${value})`,
});

export const dpdy = dualImpl<DerivativeSignature>({
  name: 'dpdy',
  normalImpl: derivativeNormalError,
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (_ctx, [value]) => stitch`dpdy(${value})`,
});

export const dpdyCoarse = dualImpl<DerivativeSignature>({
  name: 'dpdyCoarse',
  normalImpl: derivativeNormalError,
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (_ctx, [value]) => stitch`dpdyCoarse(${value})`,
});

export const dpdyFine = dualImpl<DerivativeSignature>({
  name: 'dpdyFine',
  normalImpl: derivativeNormalError,
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (_ctx, [value]) => stitch`dpdyFine(${value})`,
});

export const fwidth = dualImpl<DerivativeSignature>({
  name: 'fwidth',
  normalImpl: derivativeNormalError,
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (_ctx, [value]) => stitch`fwidth(${value})`,
});

export const fwidthCoarse = dualImpl<DerivativeSignature>({
  name: 'fwidthCoarse',
  normalImpl: derivativeNormalError,
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (_ctx, [value]) => stitch`fwidthCoarse(${value})`,
});

export const fwidthFine = dualImpl<DerivativeSignature>({
  name: 'fwidthFine',
  normalImpl: derivativeNormalError,
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (_ctx, [value]) => stitch`fwidthFine(${value})`,
});
