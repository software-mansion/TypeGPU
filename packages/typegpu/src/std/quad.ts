import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { i32, u32 } from '../data/numeric.ts';
import type { AnyNumericVecInstance, AnyWgslData } from '../data/wgslTypes.ts';
import { unify } from '../tgsl/conversion.ts';

interface IdentityNumOrVec {
  (e: number): number;
  <T extends AnyNumericVecInstance>(e: T): T;
}

interface IdentityNumOrVecWithId {
  (e: number, id: number): number;
  <T extends AnyNumericVecInstance>(e: T, id: number): T;
}

const errorMessage = 'Quad operations can only be used in the GPU context.';

export const quadBroadcast = dualImpl<IdentityNumOrVecWithId>({
  name: 'quadBroadcast',
  signature: (...args) => {
    const id = unify([args[1]] as [AnyWgslData], [i32, u32]);
    if (!id) {
      throw new Error(
        `quadBroadcast's second argument has to be compatible with i32 or u32. Got: ${
          args[1].type
        }`,
      );
    }
    return { argTypes: [args[0], id[0]], returnType: args[0] };
  },
  normalImpl: errorMessage,
  codegenImpl: (_ctx, [e, id]) => stitch`quadBroadcast(${e}, ${id})`,
  sideEffects: false,
});

export const quadSwapDiagonal = dualImpl<IdentityNumOrVec>({
  name: 'quadSwapDiagonal',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (_ctx, [e]) => stitch`quadSwapDiagonal(${e})`,
  sideEffects: false,
});

export const quadSwapX = dualImpl<IdentityNumOrVec>({
  name: 'quadSwapX',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (_ctx, [e]) => stitch`quadSwapX(${e})`,
  sideEffects: false,
});

export const quadSwapY = dualImpl<IdentityNumOrVec>({
  name: 'quadSwapY',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (_ctx, [e]) => stitch`quadSwapY(${e})`,
  sideEffects: false,
});
