import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';

function cpuCopy<T>(e: T): T {
  return e;
}

export const copy = dualImpl({
  name: 'arrayLength',
  signature: (arg) => {
    return {
      argTypes: [arg],
      returnType: arg,
    };
  },
  normalImpl: cpuCopy,
  codegenImpl(_ctx, [a]) {
    return stitch`${a}`;
  },
});
