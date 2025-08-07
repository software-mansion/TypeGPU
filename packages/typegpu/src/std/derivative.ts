import { createDualImpl } from '../core/function/dualImpl.ts';
import { snip } from '../data/snippet.ts';
import type { AnyFloat32VecInstance } from '../data/wgslTypes.ts';

export const dpdx = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (ctx, value) => snip(`dpdx(${ctx.resolve(value.value)})`, value.dataType),
  'dpdx',
);

export const dpdxCoarse = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (ctx, value) =>
    snip(`dpdxCoarse(${ctx.resolve(value.value)})`, value.dataType),
  'dpdxCoarse',
);

export const dpdxFine = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (ctx, value) => snip(`dpdxFine(${ctx.resolve(value.value)})`, value.dataType),
  'dpdxFine',
);

export const dpdy = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (ctx, value) => snip(`dpdy(${ctx.resolve(value.value)})`, value.dataType),
  'dpdy',
);

export const dpdyCoarse = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (ctx, value) =>
    snip(`dpdyCoarse(${ctx.resolve(value.value)})`, value.dataType),
  'dpdyCoarse',
);

export const dpdyFine = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (ctx, value) => snip(`dpdyFine(${ctx.resolve(value.value)})`, value.dataType),
  'dpdyFine',
);

export const fwidth = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (ctx, value) => snip(`fwidth(${ctx.resolve(value.value)})`, value.dataType),
  'fwidth',
);

export const fwidthCoarse = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (ctx, value) =>
    snip(`fwidthCoarse(${ctx.resolve(value.value)})`, value.dataType),
  'fwidthCoarse',
);

export const fwidthFine = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error('Derivative builtins are not allowed on the cpu');
  },
  // GPU implementation
  (ctx, value) =>
    snip(`fwidthFine(${ctx.resolve(value.value)})`, value.dataType),
  'fwidthFine',
);
