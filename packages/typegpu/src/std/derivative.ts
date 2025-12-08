import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import type { AnyFloat32VecInstance } from '../data/wgslTypes.ts';

export const dpdx = dualImpl<
  & ((value: number) => number)
  & (<T extends AnyFloat32VecInstance>(value: T) => T)
>({
  name: 'dpdx',
  normalImpl: 'Derivative builtins are not allowed on the CPU',
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (value) => stitch`dpdx(${value})`,
});

export const dpdxCoarse = dualImpl<
  & ((value: number) => number)
  & (<T extends AnyFloat32VecInstance>(value: T) => T)
>({
  name: 'dpdxCoarse',
  normalImpl: 'Derivative builtins are not allowed on the CPU',
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (value) => stitch`dpdxCoarse(${value})`,
});

export const dpdxFine = dualImpl<
  & ((value: number) => number)
  & (<T extends AnyFloat32VecInstance>(value: T) => T)
>({
  name: 'dpdxFine',
  normalImpl: 'Derivative builtins are not allowed on the CPU',
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (value) => stitch`dpdxFine(${value})`,
});

export const dpdy = dualImpl<
  & ((value: number) => number)
  & (<T extends AnyFloat32VecInstance>(value: T) => T)
>({
  name: 'dpdy',
  normalImpl: 'Derivative builtins are not allowed on the CPU',
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (value) => stitch`dpdy(${value})`,
});

export const dpdyCoarse = dualImpl<
  & ((value: number) => number)
  & (<T extends AnyFloat32VecInstance>(value: T) => T)
>({
  name: 'dpdyCoarse',
  normalImpl: 'Derivative builtins are not allowed on the CPU',
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (value) => stitch`dpdyCoarse(${value})`,
});

export const dpdyFine = dualImpl<
  & ((value: number) => number)
  & (<T extends AnyFloat32VecInstance>(value: T) => T)
>({
  name: 'dpdyFine',
  normalImpl: 'Derivative builtins are not allowed on the CPU',
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (value) => stitch`dpdyFine(${value})`,
});

export const fwidth = dualImpl<
  & ((value: number) => number)
  & (<T extends AnyFloat32VecInstance>(value: T) => T)
>({
  name: 'fwidth',
  normalImpl: 'Derivative builtins are not allowed on the CPU',
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (value) => stitch`fwidth(${value})`,
});

export const fwidthCoarse = dualImpl<
  & ((value: number) => number)
  & (<T extends AnyFloat32VecInstance>(value: T) => T)
>({
  name: 'fwidthCoarse',
  normalImpl: 'Derivative builtins are not allowed on the CPU',
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (value) => stitch`fwidthCoarse(${value})`,
});

export const fwidthFine = dualImpl<
  & ((value: number) => number)
  & (<T extends AnyFloat32VecInstance>(value: T) => T)
>({
  name: 'fwidthFine',
  normalImpl: 'Derivative builtins are not allowed on the CPU',
  signature: (value) => ({ argTypes: [value], returnType: value }),
  codegenImpl: (value) => stitch`fwidthFine(${value})`,
});
