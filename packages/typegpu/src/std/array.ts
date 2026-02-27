import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { abstractInt, u32 } from '../data/numeric.ts';
import { ptrFn } from '../data/ptr.ts';
import { type _ref as ref, isRef } from '../data/ref.ts';
import { isPtr, isWgslArray, type StorableData } from '../data/wgslTypes.ts';

const sizeOfPointedToArray = (dataType: unknown) =>
  isPtr(dataType) && isWgslArray(dataType.inner)
    ? dataType.inner.elementCount
    : 0;

export const arrayLength = dualImpl({
  name: 'arrayLength',
  signature: (arg) => {
    const ptrArg = isPtr(arg) ? arg : ptrFn(arg as StorableData);
    return ({
      argTypes: [ptrArg],
      returnType: sizeOfPointedToArray(ptrArg) > 0 ? abstractInt : u32,
    });
  },
  normalImpl: (a: unknown[] | ref<unknown[]>) =>
    isRef(a) ? a.$.length : a.length,
  codegenImpl(_ctx, [a]) {
    const length = sizeOfPointedToArray(a.dataType);
    return length > 0 ? `${length}` : stitch`arrayLength(${a})`;
  },
});
