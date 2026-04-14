import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { abstractInt, u32 } from '../data/numeric.ts';
import { ptrFn } from '../data/ptr.ts';
import { type _ref as ref, isRef } from '../data/ref.ts';
import { isPtr, isWgslArray, type StorableData } from '../data/wgslTypes.ts';
import { DualFn } from '../types.ts';

const sizeOfPointedToArray = (dataType: unknown) =>
  isPtr(dataType) && isWgslArray(dataType.inner) ? dataType.inner.elementCount : 0;

function cpu_arrayLength(a: unknown[] | ref<unknown[]>): number {
  return isRef(a) ? a.$.length : a.length;
}

export const arrayLength: DualFn<typeof cpu_arrayLength> = dualImpl({
  name: 'arrayLength',
  signature: (arg) => {
    const ptrArg = isPtr(arg) ? arg : ptrFn(arg as StorableData);
    return {
      argTypes: [ptrArg],
      returnType: sizeOfPointedToArray(ptrArg) > 0 ? abstractInt : u32,
    };
  },
  normalImpl: cpu_arrayLength,
  codegenImpl(_ctx, [a]) {
    const length = sizeOfPointedToArray(a.dataType);
    return length > 0 ? `${length}` : stitch`arrayLength(${a})`;
  },
});
