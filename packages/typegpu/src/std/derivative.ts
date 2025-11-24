import { createDualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { snip } from '../data/snippet.ts';
import type { AnyFloat32VecInstance } from '../data/wgslTypes.ts';

function cpuDpdx(value: number): number;
function cpuDpdx<T extends AnyFloat32VecInstance>(value: T): T;
function cpuDpdx<T extends AnyFloat32VecInstance | number>(value: T): T {
  throw new Error('Derivative builtins are not allowed on the cpu');
}

export const dpdx = createDualImpl(
  cpuDpdx,
  (value) =>
    snip(stitch`dpdx(${value})`, value.dataType, /* origin */ 'runtime'),
  'dpdx',
);

function cpuDpdxCoarse(value: number): number;
function cpuDpdxCoarse<T extends AnyFloat32VecInstance>(value: T): T;
function cpuDpdxCoarse<T extends AnyFloat32VecInstance | number>(
  value: T,
): T {
  throw new Error('Derivative builtins are not allowed on the cpu');
}

export const dpdxCoarse = createDualImpl(
  cpuDpdxCoarse,
  (value) =>
    snip(stitch`dpdxCoarse(${value})`, value.dataType, /* origin */ 'runtime'),
  'dpdxCoarse',
);

function cpuDpdxFine(value: number): number;
function cpuDpdxFine<T extends AnyFloat32VecInstance>(value: T): T;
function cpuDpdxFine<T extends AnyFloat32VecInstance | number>(value: T): T {
  throw new Error('Derivative builtins are not allowed on the cpu');
}

export const dpdxFine = createDualImpl(
  cpuDpdxFine,
  (value) =>
    snip(stitch`dpdxFine(${value})`, value.dataType, /* origin */ 'runtime'),
  'dpdxFine',
);

function cpuDpdy(value: number): number;
function cpuDpdy<T extends AnyFloat32VecInstance>(value: T): T;
function cpuDpdy<T extends AnyFloat32VecInstance | number>(value: T): T {
  throw new Error('Derivative builtins are not allowed on the cpu');
}

export const dpdy = createDualImpl(
  cpuDpdy,
  (value) =>
    snip(stitch`dpdy(${value})`, value.dataType, /* origin */ 'runtime'),
  'dpdy',
);

function cpuDpdyCoarse(value: number): number;
function cpuDpdyCoarse<T extends AnyFloat32VecInstance>(value: T): T;
function cpuDpdyCoarse<T extends AnyFloat32VecInstance | number>(
  value: T,
): T {
  throw new Error('Derivative builtins are not allowed on the cpu');
}

export const dpdyCoarse = createDualImpl(
  cpuDpdyCoarse,
  (value) =>
    snip(stitch`dpdyCoarse(${value})`, value.dataType, /* origin */ 'runtime'),
  'dpdyCoarse',
);

function cpuDpdyFine(value: number): number;
function cpuDpdyFine<T extends AnyFloat32VecInstance>(value: T): T;
function cpuDpdyFine<T extends AnyFloat32VecInstance | number>(value: T): T {
  throw new Error('Derivative builtins are not allowed on the cpu');
}

export const dpdyFine = createDualImpl(
  cpuDpdyFine,
  (value) =>
    snip(stitch`dpdyFine(${value})`, value.dataType, /* origin */ 'runtime'),
  'dpdyFine',
);

function cpuFwidth(value: number): number;
function cpuFwidth<T extends AnyFloat32VecInstance>(value: T): T;
function cpuFwidth<T extends AnyFloat32VecInstance | number>(value: T): T {
  throw new Error('Derivative builtins are not allowed on the cpu');
}

export const fwidth = createDualImpl(
  cpuFwidth,
  (value) =>
    snip(stitch`fwidth(${value})`, value.dataType, /* origin */ 'runtime'),
  'fwidth',
);

function cpuFwidthCoarse(value: number): number;
function cpuFwidthCoarse<T extends AnyFloat32VecInstance>(value: T): T;
function cpuFwidthCoarse<T extends AnyFloat32VecInstance | number>(
  value: T,
): T {
  throw new Error('Derivative builtins are not allowed on the cpu');
}

export const fwidthCoarse = createDualImpl(
  cpuFwidthCoarse,
  (value) =>
    snip(
      stitch`fwidthCoarse(${value})`,
      value.dataType,
      /* origin */ 'runtime',
    ),
  'fwidthCoarse',
);

function cpuFwidthFine(value: number): number;
function cpuFwidthFine<T extends AnyFloat32VecInstance>(value: T): T;
function cpuFwidthFine<T extends AnyFloat32VecInstance | number>(
  value: T,
): T {
  throw new Error('Derivative builtins are not allowed on the cpu');
}

export const fwidthFine = createDualImpl(
  cpuFwidthFine,
  (value) =>
    snip(stitch`fwidthFine(${value})`, value.dataType, /* origin */ 'runtime'),
  'fwidthFine',
);
