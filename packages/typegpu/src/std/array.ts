import { stitch } from '../core/resolve/stitch.ts';
import { abstractInt, u32 } from '../data/numeric.ts';
import { ptrFn } from '../data/ptr.ts';
import { isPtr, isWgslArray } from '../data/wgslTypes.ts';
import { dualImpl } from '../core/function/dualImpl.ts';

const sizeOfPointedToArray = (dataType: unknown) =>
  isPtr(dataType) && isWgslArray(dataType.inner)
    ? dataType.inner.elementCount
    : 0;

export const arrayLength = dualImpl({
  name: 'arrayLength',
  signature: (arg) => {
    const ptrArg = isPtr(arg) ? arg : ptrFn(arg);
    return ({
      argTypes: [ptrArg],
      returnType: sizeOfPointedToArray(ptrArg) > 0 ? abstractInt : u32,
    });
  },
  normalImpl: (a: unknown[]) => a.length,
  codegenImpl(a) {
    const length = sizeOfPointedToArray(a.dataType);
    return length > 0 ? String(length) : stitch`arrayLength(${a})`;
  },
});
