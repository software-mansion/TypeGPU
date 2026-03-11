import { dualImpl } from '../core/function/dualImpl.ts';
import { Void } from '../data/wgslTypes.ts';

export const discard = dualImpl<() => never>({
  name: 'discard',
  normalImpl: '`discard` relies on GPU resources and cannot be executed outside of a draw call',
  signature: { argTypes: [], returnType: Void },
  codegenImpl: () => 'discard;',
});
