import { createDualImpl } from '../core/function/dualImpl.ts';
import { snip } from '../data/snippet.ts';
import type { AnyFloat32VecInstance } from '../data/wgslTypes.ts';

export const dpdx = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(`dpdx(${value.value})`, value.dataType),
  'dpdx',
);

export const dpdxCoarse = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(`dpdxCoarse(${value.value})`, value.dataType),
  'dpdxCoarse',
);

export const dpdxFine = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(`dpdxFine(${value.value})`, value.dataType),
  'dpdxFine',
);

export const dpdy = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(`dpdy(${value.value})`, value.dataType),
  'dpdy',
);

export const dpdyCoarse = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(`dpdyCoarse(${value.value})`, value.dataType),
  'dpdyCoarse',
);

export const dpdyFine = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(`dpdyFine(${value.value})`, value.dataType),
  'dpdyFine',
);

export const fwidth = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(`fwidth(${value.value})`, value.dataType),
  'fwidth',
);

export const fwidthCoarse = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(`fwidthCoarse(${value.value})`, value.dataType),
  'fwidthCoarse',
);

export const fwidthFine = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (value) => snip(`fwidthFine(${value.value})`, value.dataType),
  'fwidthFine',
);
