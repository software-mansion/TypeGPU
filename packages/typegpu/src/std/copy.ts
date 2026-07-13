import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { isMatInstance, isVecInstance, WORKAROUND_getSchema } from '../data/wgslTypes.ts';

function cpuCopy<T>(e: T): T {
  if (isVecInstance(e) || isMatInstance(e)) {
    const schema = WORKAROUND_getSchema(e);
    return schema(e as never) as T;
  }

  if (Array.isArray(e)) {
    return e.map(cpuCopy) as T;
  }

  if (typeof e === 'object' && e !== null) {
    return Object.fromEntries(Object.entries(e).map(([key, value]) => [key, cpuCopy(value)])) as T;
  }

  return e;
}

export const copy = dualImpl({
  name: 'copy',
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
  sideEffects: false,
});
