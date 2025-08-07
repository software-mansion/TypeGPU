import { stitch } from '../core/resolve/stitch.ts';import { createDualImpl } from '../core/function/dualImpl.ts';
import { snip } from '../data/snippet.ts';
import type { AnyFloat32VecInstance } from '../data/wgslTypes.ts';

export const dpdx = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(stitch`dpdx(${value})`, value.dataType),
  'dpdx',
);

export const dpdxCoarse = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) =>
    snip(stitch`dpdxCoarse(${value})`, value.dataType),
  'dpdxCoarse',
);

export const dpdxFine = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(stitch`dpdxFine(${value})`, value.dataType),
  'dpdxFine',
);

export const dpdy = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(stitch`dpdy(${value})`, value.dataType),
  'dpdy',
);

export const dpdyCoarse = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) =>
    snip(stitch`dpdyCoarse(${value})`, value.dataType),
  'dpdyCoarse',
);

export const dpdyFine = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(stitch`dpdyFine(${value})`, value.dataType),
  'dpdyFine',
);

export const fwidth = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(stitch`fwidth(${value})`, value.dataType),
  'fwidth',
);

export const fwidthCoarse = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) =>
    snip(stitch`fwidthCoarse(${value})`, value.dataType),
  'fwidthCoarse',
);

export const fwidthFine = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) =>
    snip(stitch`fwidthFine(${value})`, value.dataType),
  'fwidthFine',
);
