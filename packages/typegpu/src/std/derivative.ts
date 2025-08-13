import { stitch } from '../core/resolve/stitch.ts';
import { createDualImpl } from '../core/function/dualImpl.ts';
import { snip } from '../data/snippet.ts';
import type { AnyFloat32VecInstance } from '../data/wgslTypes.ts';

export const dpdx = createDualImpl({
  name: 'dpdx',
  // CPU implementation
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`dpdx(${value})`, value.dataType),
});

export const dpdxCoarse = createDualImpl({
  name: 'dpdxCoarse',
  // CPU implementation
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`dpdxCoarse(${value})`, value.dataType),
});

export const dpdxFine = createDualImpl({
  name: 'dpdxFine',
  // CPU implementation
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`dpdxFine(${value})`, value.dataType),
});

export const dpdy = createDualImpl({
  name: 'dpdy',
  // CPU implementation
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`dpdy(${value})`, value.dataType),
});

export const dpdyCoarse = createDualImpl({
  name: 'dpdyCoarse',
  // CPU implementation
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`dpdyCoarse(${value})`, value.dataType),
});

export const dpdyFine = createDualImpl({
  name: 'dpdyFine',
  // CPU implementation
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`dpdyFine(${value})`, value.dataType),
});

export const fwidth = createDualImpl({
  name: 'fwidth',
  // CPU implementation
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`fwidth(${value})`, value.dataType),
});

export const fwidthCoarse = createDualImpl({
  name: 'fwidthCoarse',
  // CPU implementation
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`fwidthCoarse(${value})`, value.dataType),
});

export const fwidthFine = createDualImpl({
  name: 'fwidthFine',
  // CPU implementation
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`fwidthFine(${value})`, value.dataType),
});
